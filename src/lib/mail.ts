import nodemailer from "nodemailer";

/** Is er een mailaccount ingesteld (SMTP_HOST, SMTP_USER en SMTP_PASSWORD in .env)? */
export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT) || 587;
  // Poort 465 gebruikt direct TLS; 587 begint onversleuteld en schakelt over via STARTTLS.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  if (!isMailConfigured()) throw new Error("E-mail is niet ingesteld (SMTP_* ontbreekt in .env).");
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  await createTransport().sendMail({ from, ...message });
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
