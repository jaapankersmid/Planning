import type { AnimalKind, CremationStatus, CremationType } from "@prisma/client";

export const STATUS_LABEL: Record<CremationStatus, string> = {
  AANGEVRAAGD: "Aangevraagd",
  GEPLAND: "Gepland",
  OPGEHAALD: "Opgehaald",
  GECREMEERD: "Gecremeerd",
  AFGEROND: "Afgerond",
  GEANNULEERD: "Geannuleerd",
};

export const STATUS_ORDER: CremationStatus[] = [
  "AANGEVRAAGD",
  "GEPLAND",
  "OPGEHAALD",
  "GECREMEERD",
  "AFGEROND",
  "GEANNULEERD",
];

export const STATUS_STYLE: Record<CremationStatus, string> = {
  AANGEVRAAGD: "bg-amber-100 text-amber-900",
  GEPLAND: "bg-sky-100 text-sky-900",
  OPGEHAALD: "bg-indigo-100 text-indigo-900",
  GECREMEERD: "bg-accent-soft text-accent",
  AFGEROND: "bg-good text-good-text",
  GEANNULEERD: "bg-surface-muted text-foreground-muted",
};

export const TYPE_LABEL: Record<CremationType, string> = {
  INDIVIDUEEL: "Individueel",
  GEZAMENLIJK: "Gezamenlijk",
  DIRECT: "Direct",
};

export const KIND_LABEL: Record<AnimalKind, string> = {
  PAARD: "Paard",
  HUISDIER: "Huisdier",
};

export const COUNTRY_LABEL: Record<string, string> = { NL: "Nederland", DE: "Duitsland" };

export const customerNumberLabel = (n: number) => `K-${String(n).padStart(4, "0")}`;
export const cremationNumberLabel = (n: number) => `C-${String(n).padStart(4, "0")}`;

/** "€ 1.234,50" uit hele centen. */
export function formatCents(cents: number | null | undefined) {
  if (cents == null) return "–";
  return `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Leest "1234,50" of "1.234,50" of "1234.5" als hele centen; null bij leeg of ongeldig. */
export function parseEuroToCents(input: string): number | null {
  const t = input.trim().replace(/€/g, "").replace(/\s/g, "");
  if (!t) return null;
  // Komma als decimaalteken: punten zijn dan duizendtallen.
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function formatISOdate(d: Date | null | undefined) {
  if (!d) return "–";
  const [y, m, day] = d.toISOString().slice(0, 10).split("-");
  return `${day}-${m}-${y}`;
}
