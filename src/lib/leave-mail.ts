import { prisma } from "@/lib/prisma";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";
import { formatRange } from "@/lib/format";

export type LeaveOutcome = "APPROVED" | "REJECTED" | "REVOKED" | "RECORDED";

const wrap = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1c2521;max-width:560px">${inner}</div>`;

/**
 * Mailt de medewerker dat zijn verlof is goedgekeurd, afgewezen, ingetrokken of door een planner is vastgelegd.
 * Alleen als de medewerker een actief account met e-mailadres heeft en meldingen niet heeft uitgezet.
 * Mislukken mag de beoordeling nooit blokkeren, dus fouten worden alleen gelogd.
 */
export async function notifyEmployeeOfLeaveOutcome(requestId: string, outcome: LeaveOutcome) {
  if (!isMailConfigured()) return;
  try {
    const request = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { employee: { include: { user: true } }, decidedBy: { select: { name: true } } },
    });
    const user = request?.employee.user;
    if (!request || !user || !user.active || !user.emailNotifications || !user.email) return;

    const range = formatRange(request.startDate, request.endDate);
    const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
    const link = base ? `${base}/verlof` : "";
    const who = request.decidedBy?.name ? ` door ${request.decidedBy.name}` : "";
    // Bij intrekken hoort de opmerking van de oorspronkelijke goedkeuring niet in de mail.
    const note = outcome === "REVOKED" ? null : request.decisionNote;

    const copy: Record<LeaveOutcome, { subject: string; headline: string; extra?: string }> = {
      APPROVED: {
        subject: `Je verlof is goedgekeurd: ${range}`,
        headline: `Je verlof van ${range} is goedgekeurd${who}.`,
        extra: "De dagen staan als V (Vrij) in het rooster.",
      },
      REJECTED: {
        subject: `Je verlofaanvraag is afgewezen: ${range}`,
        headline: `Je verlofaanvraag voor ${range} is afgewezen${who}.`,
      },
      REVOKED: {
        subject: `Je goedgekeurde verlof is ingetrokken: ${range}`,
        headline: `Je goedgekeurde verlof van ${range} is ingetrokken${who}.`,
        extra: "De dagen vanaf vandaag zijn uit het rooster gehaald. Neem contact op met een planner als je hier vragen over hebt.",
      },
      RECORDED: {
        subject: `Verlof voor je vastgelegd: ${range}`,
        headline: `Er is verlof voor je vastgelegd van ${range}${who}.`,
        extra: "De dagen staan als V (Vrij) in het rooster.",
      },
    };
    const { subject, headline, extra } = copy[outcome];
    const noteText = note && outcome !== "RECORDED" ? `Opmerking van de planner: ${note}` : null;

    const text = [
      `Hallo ${request.employee.name},`,
      "",
      headline,
      ...(extra ? [extra] : []),
      ...(noteText ? ["", noteText] : []),
      "",
      ...(link ? [`Bekijk je verlof: ${link}`, ""] : []),
      "Je kunt deze e-mails uitzetten bij Mijn rooster in de app.",
    ].join("\n");
    const html = wrap(
      `<p>Hallo ${escapeHtml(request.employee.name)},</p>
<p><strong>${escapeHtml(headline)}</strong>${extra ? `<br>${escapeHtml(extra)}` : ""}</p>${
        noteText ? `<p>${escapeHtml(noteText)}</p>` : ""
      }${
        link
          ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f6e63;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">Bekijk je verlof</a></p>`
          : ""
      }<p style="color:#666;font-size:12px">Je kunt deze e-mails uitzetten bij Mijn rooster in de app.</p>`,
    );

    await sendMail({ to: user.email, subject, text, html });
  } catch (error) {
    console.error("Mail over verlofbeslissing mislukt:", error instanceof Error ? error.message : error);
  }
}
