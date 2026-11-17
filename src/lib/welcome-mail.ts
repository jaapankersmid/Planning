import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";

export type WelcomeMailResult = "sent" | "failed" | "not-configured";

const wrap = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1c2521;max-width:560px">${inner}</div>`;

/**
 * Welkomstmail bij een nieuw account: inloglink, e-mailadres en (tijdelijk) wachtwoord.
 * Mislukken mag het aanmaken van het account nooit blokkeren, dus fouten worden alleen gelogd,
 * zonder de inhoud van de mail (het wachtwoord komt nooit in de log).
 */
export async function sendWelcomeMail(user: { name: string; email: string; password: string; mustChange: boolean }): Promise<WelcomeMailResult> {
  if (!(await isMailConfigured())) return "not-configured";
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const link = base ? `${base}/login` : "";
  const help = base ? `${base}/hulp` : "";
  const change = user.mustChange
    ? "Dit is een tijdelijk wachtwoord: bij de eerste keer inloggen kies je zelf een nieuw wachtwoord."
    : "Je kunt dit wachtwoord later zelf wijzigen.";

  const text = [
    `Hallo ${user.name},`,
    "",
    "Er is een account voor je aangemaakt in de roosterapp. Daarin zie je je rooster, vraag je verlof aan en geef je je beschikbaarheid op.",
    "",
    ...(link ? [`Inloggen: ${link}`] : []),
    `E-mailadres: ${user.email}`,
    `Wachtwoord: ${user.password}`,
    "",
    change,
    "",
    ...(help ? [`Uitleg over de app (Hoe werkt het?): ${help}`, ""] : []),
    "Heb je vragen? Neem contact op met een planner.",
  ].join("\n");

  const html = wrap(
    `<p>Hallo ${escapeHtml(user.name)},</p>` +
      "<p>Er is een account voor je aangemaakt in de roosterapp. Daarin zie je je rooster, vraag je verlof aan en geef je je beschikbaarheid op.</p>" +
      '<table style="border-collapse:collapse;margin:8px 0">' +
      (link ? `<tr><td style="padding:2px 12px 2px 0;color:#5b6660">Inloggen</td><td><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></td></tr>` : "") +
      `<tr><td style="padding:2px 12px 2px 0;color:#5b6660">E-mailadres</td><td>${escapeHtml(user.email)}</td></tr>` +
      `<tr><td style="padding:2px 12px 2px 0;color:#5b6660">Wachtwoord</td><td style="font-family:monospace">${escapeHtml(user.password)}</td></tr>` +
      "</table>" +
      `<p>${escapeHtml(change)}</p>` +
      (help ? `<p>Uitleg over de app vind je bij <a href="${escapeHtml(help)}">Hoe werkt het?</a></p>` : "") +
      "<p>Heb je vragen? Neem contact op met een planner.</p>",
  );

  try {
    await sendMail({ to: user.email, subject: "Je account voor de roosterapp", text, html });
    return "sent";
  } catch (error) {
    console.error("Welkomstmail versturen mislukt:", error instanceof Error ? error.message : "onbekende fout");
    return "failed";
  }
}
