import { prisma } from "@/lib/prisma";

/*
 * Niet-geheime app-instellingen. Volgorde: eerst de waarde in de database (tabel AppSetting, beheerd onder
 * Instellingen), anders de waarde uit .env, anders de standaard. Zolang er niets is ingevuld, werkt alles dus
 * precies als voorheen. Geheimen (SMTP_PASSWORD, AUTH_SECRET, DATABASE_URL, GOOGLE_CLIENT_SECRET, SSO_SECRET ...)
 * staan hier bewust niet in en komen nooit in de database of op het scherm.
 */

export type SettingGroup = "company" | "mail";
export type SettingKind = "text" | "email" | "url" | "phone" | "host" | "port" | "secure" | "minutes";

export type SettingDef = {
  key: string;
  label: string;
  group: SettingGroup;
  kind: SettingKind;
  /** Naam van de variabele in .env waarop wordt teruggevallen. */
  env?: string;
  /** Waarde als database en .env allebei leeg zijn. */
  fallback?: string;
  help?: string;
};

export const SETTING_DEFS = [
  { key: "companyName", label: "Bedrijfsnaam", group: "company", kind: "text", fallback: "Bréborgh", help: "Bovenaan in de app en onderaan in de mails." },
  { key: "companyStreet", label: "Adres", group: "company", kind: "text" },
  { key: "companyPostalCity", label: "Postcode en plaats", group: "company", kind: "text" },
  { key: "companyPhone", label: "Telefoon", group: "company", kind: "phone" },
  { key: "companyEmail", label: "E-mail", group: "company", kind: "email" },
  { key: "companyWebsite", label: "Website", group: "company", kind: "url", help: "Met https:// ervoor." },

  { key: "smtpHost", label: "SMTP-server", group: "mail", kind: "host", env: "SMTP_HOST", help: "Bijvoorbeeld smtp.gmail.com." },
  { key: "smtpPort", label: "Poort", group: "mail", kind: "port", env: "SMTP_PORT", fallback: "587", help: "587 of 465 (poort 25 is bij Hetzner geblokkeerd)." },
  { key: "smtpSecure", label: "Beveiliging", group: "mail", kind: "secure", env: "SMTP_SECURE", help: "Automatisch: 465 = direct TLS, anders STARTTLS." },
  { key: "smtpUser", label: "Gebruikersnaam", group: "mail", kind: "text", env: "SMTP_USER", help: "Het wachtwoord blijft in .env (SMTP_PASSWORD)." },
  { key: "mailFromName", label: "Afzendernaam", group: "mail", kind: "text", help: "Leeg = zoals SMTP_FROM in .env." },
  { key: "mailFromAddress", label: "Afzenderadres", group: "mail", kind: "email", help: "Leeg = zoals SMTP_FROM in .env, anders de gebruikersnaam." },
  { key: "mailReplyTo", label: "Antwoordadres", group: "mail", kind: "email", help: "Waar een antwoord op een mail naartoe gaat. Leeg = het afzenderadres." },
  { key: "notifyDelayMinutes", label: "Wachttijd gebundelde mails (minuten)", group: "mail", kind: "minutes", env: "NOTIFY_DELAY_MINUTES", fallback: "10" },
  { key: "feedbackTo", label: "Feedback naar", group: "mail", kind: "email", env: "FEEDBACK_TO", fallback: "Jaapankersmid@gmail.com", help: "Waar de feedbackknop naartoe mailt." },
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTING_DEFS)[number]["key"];
export type Settings = Record<SettingKey, string>;
export const SETTING_KEYS = SETTING_DEFS.map((d) => d.key) as SettingKey[];
const defOf = (key: string): SettingDef | undefined => (SETTING_DEFS as readonly SettingDef[]).find((d) => d.key === key);

/** Geheimen die in .env blijven; het scherm toont alleen of ze zijn ingesteld. */
export const SECRET_ENV = [
  { env: "SMTP_PASSWORD", label: "Wachtwoord van het mailaccount" },
  { env: "AUTH_SECRET", label: "Sleutel voor de inlogsessies" },
  { env: "DATABASE_URL", label: "Databaseverbinding (met wachtwoord)" },
  { env: "GOOGLE_CLIENT_SECRET", label: "Google Calendar-koppeling" },
  { env: "SSO_SECRET", label: "Koppeling met de Hub" },
] as const;

export function secretStatus() {
  return SECRET_ENV.map((s) => ({ ...s, set: Boolean(process.env[s.env]?.trim()) }));
}

// Korte cache, zodat niet elke mail een databasevraag kost. Na opslaan wordt hij meteen geleegd.
const TTL_MS = 30_000;
let cache: { at: number; rows: Map<string, string> } | null = null;

export function invalidateSettings() {
  cache = null;
}

/** De waarden die in de database staan (leeg = niet ingevuld). */
export async function getStoredSettings(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const rows = await prisma.appSetting.findMany();
    cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.key, r.value])) };
  } catch (error) {
    // Bestaat de tabel nog niet (db push nog niet gedraaid) of is de database even weg: val terug op .env.
    console.error("Instellingen lezen mislukt, terugval op .env:", error instanceof Error ? error.message : "onbekende fout");
    cache = { at: Date.now(), rows: new Map() };
  }
  return cache.rows;
}

/** Wat er geldt als de databasewaarde leeg is: .env of de standaard. */
export function fallbackValue(key: SettingKey): { value: string; source: "env" | "default" | "none" } {
  const def = defOf(key)!;
  const env = def.env ? process.env[def.env]?.trim() : undefined;
  if (env) return { value: env, source: "env" };
  if (def.fallback) return { value: def.fallback, source: "default" };
  return { value: "", source: "none" };
}

/** Alle geldende instellingen: database, anders .env, anders de standaard. */
export async function getSettings(): Promise<Settings> {
  const stored = await getStoredSettings();
  const out = {} as Settings;
  for (const key of SETTING_KEYS) out[key] = stored.get(key)?.trim() || fallbackValue(key).value;
  return out;
}

/** De mailinstellingen zoals de verzending ze nodig heeft. Het wachtwoord komt alleen uit .env. */
export async function getMailConfig() {
  const stored = await getStoredSettings();
  const s = await getSettings();
  const port = Number(s.smtpPort) || 587;
  const secure = s.smtpSecure ? s.smtpSecure === "true" : port === 465;
  const name = stored.get("mailFromName")?.trim();
  const address = stored.get("mailFromAddress")?.trim();
  // Niets ingevuld in de app: precies zoals voorheen (SMTP_FROM, anders de gebruikersnaam).
  const from: string | { name: string; address: string } =
    name || address ? { name: name ?? "", address: address || parseFrom(process.env.SMTP_FROM).address || s.smtpUser } : process.env.SMTP_FROM || s.smtpUser;
  return {
    host: s.smtpHost,
    port,
    secure,
    user: s.smtpUser,
    password: process.env.SMTP_PASSWORD ?? "",
    from,
    replyTo: s.mailReplyTo || undefined,
  };
}

/** "Naam <adres>" of alleen een adres. */
function parseFrom(raw: string | undefined) {
  const v = (raw ?? "").trim();
  const m = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(v);
  return m ? { name: m[1].trim(), address: m[2].trim() } : { name: "", address: v };
}

/** Controleert één waarde. Leeg mag altijd: dan geldt .env of de standaard. Geeft een foutmelding of null. */
export function validateSetting(key: string, raw: string): string | null {
  const def = defOf(key);
  if (!def) return "Onbekende instelling.";
  const v = raw.trim();
  if (!v) return null;
  if (v.length > 200) return `${def.label}: maximaal 200 tekens.`;
  if (/[\u0000-\u001f\u007f]/.test(v)) return `${def.label}: geen regeleinden of speciale tekens.`;
  switch (def.kind) {
    case "email":
      return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(v) ? null : `${def.label}: geen geldig e-mailadres.`;
    case "url":
      return /^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/.test(v) ? null : `${def.label}: begin met http:// of https://.`;
    case "phone":
      return /^[0-9+()\-.\s]{6,30}$/.test(v) ? null : `${def.label}: alleen cijfers, spaties en + ( ) -.`;
    case "host":
      return /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(v) ? null : `${def.label}: geen geldige servernaam.`;
    case "port":
      return /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535 ? null : `${def.label}: een getal van 1 tot en met 65535.`;
    case "secure":
      return v === "true" || v === "false" ? null : `${def.label}: kies automatisch, ja of nee.`;
    case "minutes":
      return /^\d+$/.test(v) && Number(v) <= 1440 ? null : `${def.label}: een heel getal van 0 tot en met 1440.`;
    default:
      return /[<>]/.test(v) ? `${def.label}: geen < of > gebruiken.` : null;
  }
}
