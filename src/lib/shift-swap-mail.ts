import { prisma } from "@/lib/prisma";
import { appLink, plannerRecipients } from "@/lib/planner-alerts";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";
import { dayLabel, describeGiven, type ShiftTypeLite } from "@/lib/shift-swap";

const wrap = (inner: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1c2521;max-width:560px">${inner}</div>`;
const button = (href: string, label: string) =>
  href ? `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#2f6e63;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>` : "";
const footer = `<p style="color:#666;font-size:12px">Je kunt deze e-mails uitzetten bij Mijn rooster in de app.</p>`;

async function load(id: string) {
  const req = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    include: {
      requester: { include: { user: true } },
      target: { include: { user: true } },
      shiftType: true,
      returnShiftType: true,
    },
  });
  if (!req) return null;
  const types: ShiftTypeLite[] = await prisma.shiftType.findMany();
  const give = describeGiven(req.shiftType, req.part, types);
  const dayGive = dayLabel(req.date);
  const back = req.returnShiftType && req.returnDate ? `${dayLabel(req.returnDate)}: ${describeGiven(req.returnShiftType, req.returnPart ?? "ALL", types)}` : null;
  return { req, give, dayGive, back };
}

/** Mailt de gevraagde collega dat er een ruilverzoek is. Mislukken mag het verzoek niet blokkeren. */
export async function notifyTargetOfSwap(id: string) {
  if (!(await isMailConfigured())) return;
  try {
    const d = await load(id);
    const user = d?.req.target.user;
    if (!d || !user || !user.active || !user.emailNotifications || !user.email) return;
    const link = appLink("/rooster/mijn");
    const subject = `Ruilverzoek van ${d.req.requester.name}: ${d.dayGive}`;
    const lines = [
      `${d.req.requester.name} vraagt of je een dienst wilt overnemen.`,
      "",
      `Dienst: ${d.dayGive}: ${d.give}`,
      ...(d.back ? [`In ruil daarvoor krijg je: ${d.back}`] : ["Je geeft hier niets voor terug."]),
      ...(d.req.note ? [`Opmerking: ${d.req.note}`] : []),
    ];
    const text = [`Hallo ${d.req.target.name},`, "", ...lines, "", ...(link ? [`Accepteren of afwijzen kan bij Mijn rooster: ${link}`, ""] : []), "Je kunt deze e-mails uitzetten bij Mijn rooster in de app."].join("\n");
    const html = wrap(
      `<p>Hallo ${escapeHtml(d.req.target.name)},</p><p><strong>${escapeHtml(d.req.requester.name)}</strong> vraagt of je een dienst wilt overnemen.</p>` +
        `<p>Dienst: <strong>${escapeHtml(d.dayGive)}: ${escapeHtml(d.give)}</strong><br>${d.back ? `In ruil daarvoor krijg je: <strong>${escapeHtml(d.back)}</strong>` : "Je geeft hier niets voor terug."}${d.req.note ? `<br>Opmerking: ${escapeHtml(d.req.note)}` : ""}</p>` +
        `${button(link, "Bekijk het verzoek")}${footer}`,
    );
    await sendMail({ to: user.email, subject, text, html });
  } catch (error) {
    console.error("Mail over ruilverzoek mislukt:", error instanceof Error ? error.message : error);
  }
}

/** Na het antwoord van de collega: de aanvrager hoort het, en bij acceptatie krijgen ook de planners een mail. */
export async function notifySwapDecided(id: string) {
  if (!(await isMailConfigured())) return;
  try {
    const d = await load(id);
    if (!d || (d.req.status !== "ACCEPTED" && d.req.status !== "DECLINED")) return;
    const accepted = d.req.status === "ACCEPTED";
    const link = appLink("/rooster");
    const who = d.req.target.name;

    const requester = d.req.requester.user;
    if (requester && requester.active && requester.emailNotifications && requester.email) {
      const subject = accepted ? `${who} heeft je ruil geaccepteerd: ${d.dayGive}` : `${who} heeft je ruilverzoek afgewezen: ${d.dayGive}`;
      const head = accepted ? `${who} heeft je ruilverzoek geaccepteerd. Het rooster is aangepast.` : `${who} heeft je ruilverzoek afgewezen.${d.req.decisionNote ? ` Reden: ${d.req.decisionNote}` : ""}`;
      const text = [`Hallo ${d.req.requester.name},`, "", head, `Dienst: ${d.dayGive}: ${d.give}`, ...(d.back ? [`In ruil daarvoor: ${d.back}`] : []), "", "Je kunt deze e-mails uitzetten bij Mijn rooster in de app."].join("\n");
      const html = wrap(`<p>Hallo ${escapeHtml(d.req.requester.name)},</p><p><strong>${escapeHtml(head)}</strong></p><p>Dienst: ${escapeHtml(d.dayGive)}: ${escapeHtml(d.give)}${d.back ? `<br>In ruil daarvoor: ${escapeHtml(d.back)}` : ""}</p>${footer}`);
      await sendMail({ to: requester.email, subject, text, html }).catch((e) => console.error("Mail aan aanvrager mislukt:", e instanceof Error ? e.message : e));
    }

    if (accepted) {
      const planners = await plannerRecipients();
      const subject = `Dienstruil: ${d.req.requester.name} en ${who} (${d.dayGive})`;
      const text = [
        `${d.req.requester.name} en ${who} hebben een dienst geruild. Het rooster is al aangepast.`,
        "",
        `${d.req.requester.name} geeft aan ${who}: ${d.dayGive}: ${d.give}`,
        ...(d.back ? [`${who} geeft aan ${d.req.requester.name}: ${d.back}`] : []),
        ...(d.req.note ? [`Opmerking: ${d.req.note}`] : []),
        "",
        ...(link ? [`Rooster: ${link}`, ""] : []),
        "Je kunt deze e-mails uitzetten bij Mijn rooster in de app.",
      ].join("\n");
      const html = wrap(
        `<p><strong>${escapeHtml(d.req.requester.name)}</strong> en <strong>${escapeHtml(who)}</strong> hebben een dienst geruild. Het rooster is al aangepast.</p>` +
          `<p>${escapeHtml(d.req.requester.name)} geeft aan ${escapeHtml(who)}: <strong>${escapeHtml(d.dayGive)}: ${escapeHtml(d.give)}</strong>${d.back ? `<br>${escapeHtml(who)} geeft aan ${escapeHtml(d.req.requester.name)}: <strong>${escapeHtml(d.back)}</strong>` : ""}${d.req.note ? `<br>Opmerking: ${escapeHtml(d.req.note)}` : ""}</p>${button(link, "Open het rooster")}${footer}`,
      );
      for (const p of planners) await sendMail({ to: p.email, subject, text, html }).catch((e) => console.error("Mail aan planner mislukt:", e instanceof Error ? e.message : e));
    }
  } catch (error) {
    console.error("Mail over ruilbesluit mislukt:", error instanceof Error ? error.message : error);
  }
}
