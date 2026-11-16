import nodemailer from "nodemailer";
import { getMailConfig, getStoredSettings } from "@/lib/settings";

/**
 * Is er een mailaccount ingesteld? Server, gebruikersnaam (Instellingen of .env) en SMTP_PASSWORD (alleen .env).
 * Gewijzigde instellingen gelden meteen, zonder herstart.
 */
export async function isMailConfigured() {
  const c = await getMailConfig();
  return Boolean(c.host && c.user && c.password);
}

/** Bedrijfsgegevens onderaan elke mail, alleen als die onder Instellingen zijn ingevuld (anders verandert er niets). */
async function companyFooter() {
  const s = await getStoredSettings();
  const lines = ["companyStreet", "companyPostalCity", "companyPhone", "companyEmail", "companyWebsite"].map((k) => s.get(k)?.trim()).filter((v): v is string => !!v);
  if (lines.length === 0) return null;
  return [s.get("companyName")?.trim() || "Bréborgh", ...lines];
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  const c = await getMailConfig();
  if (!c.host || !c.user || !c.password) throw new Error("E-mail is niet ingesteld (SMTP-server, gebruikersnaam of SMTP_PASSWORD ontbreekt).");
  const transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // Poort 465 gebruikt direct TLS; 587 begint onversleuteld en schakelt over via STARTTLS.
    secure: c.secure,
    auth: { user: c.user, pass: c.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const footer = await companyFooter();
  const text = footer ? `${message.text}\n\n--\n${footer.join("\n")}` : message.text;
  const html = footer
    ? `${message.html}<p style="margin-top:24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7570">${footer.map(escapeHtml).join("<br>")}</p>`
    : message.html;
  await transport.sendMail({ from: c.from, ...(c.replyTo ? { replyTo: c.replyTo } : {}), ...message, text, html });
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
