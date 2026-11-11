import { prisma } from "@/lib/prisma";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";
import { formatDayMonth, weekdayFull } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";

/** Hoeveel minuten er niets meer is aangepast voordat de gebundelde mail de deur uit gaat. */
function quietMinutes() {
  const value = Number(process.env.NOTIFY_DELAY_MINUTES);
  return Number.isFinite(value) && value >= 0 ? value : 10;
}

const MAX_ATTEMPTS = 5;

/**
 * Legt vast dat de dienst van een medewerker op een dag is gewijzigd door een
 * planner, zodat de medewerker er een mail over krijgt. Per dag wordt alleen de
 * nettowijziging bewaard: wordt een dienst teruggezet naar hoe hij was, dan
 * komt er geen mail. Dagen die al geweest zijn tellen niet mee.
 */
export async function recordRosterChange(input: {
  employeeId: string;
  date: Date;
  oldShiftTypeId: string | null;
  newShiftTypeId: string | null;
}) {
  if (input.date < todayAmsterdam()) return;
  const key = { employeeId_date: { employeeId: input.employeeId, date: input.date } };
  const existing = await prisma.rosterChange.findUnique({ where: key });
  const oldShiftTypeId = existing ? existing.oldShiftTypeId : input.oldShiftTypeId;

  if (oldShiftTypeId === input.newShiftTypeId) {
    if (existing) await prisma.rosterChange.delete({ where: key });
    return;
  }
  await prisma.rosterChange.upsert({
    where: key,
    update: { newShiftTypeId: input.newShiftTypeId, attempts: 0 },
    create: {
      employeeId: input.employeeId,
      date: input.date,
      oldShiftTypeId,
      newShiftTypeId: input.newShiftTypeId,
    },
  });
}

type Shift = { code: string; label: string; startTime: string | null; endTime: string | null; secondStartTime: string | null; secondEndTime: string | null } | null;

function describeShift(shift: Shift) {
  if (!shift) return "geen dienst";
  const times = shift.startTime && shift.endTime
    ? ` (${shift.startTime}–${shift.endTime}${shift.secondStartTime && shift.secondEndTime ? ` en ${shift.secondStartTime}–${shift.secondEndTime}` : ""})`
    : "";
  return `${shift.code} · ${shift.label}${times}`;
}

type Line = { date: Date; kind: "nieuw" | "gewijzigd" | "vervallen"; oldText: string; newText: string };

export function buildMail(name: string, lines: Line[]) {
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const link = base ? `${base}/rooster/mijn` : "";
  const dayLabel = (d: Date) => `${weekdayFull(d)} ${formatDayMonth(d)}`;
  const heading = lines.length === 1 ? "Er is 1 wijziging in je rooster" : `Er zijn ${lines.length} wijzigingen in je rooster`;
  const subject =
    lines.length === 1 && lines[0].kind === "nieuw"
      ? `Je bent ingepland op ${dayLabel(lines[0].date)}`
      : heading;

  const text = [
    `Hoi ${name},`,
    "",
    `${heading}:`,
    "",
    ...lines.map((l) =>
      l.kind === "nieuw"
        ? `- ${dayLabel(l.date)}: ingepland als ${l.newText}`
        : l.kind === "vervallen"
          ? `- ${dayLabel(l.date)}: je dienst vervalt (was ${l.oldText})`
          : `- ${dayLabel(l.date)}: gewijzigd van ${l.oldText} naar ${l.newText}`,
    ),
    "",
    ...(link ? [`Bekijk je rooster: ${link}`, ""] : []),
    "Je kunt deze e-mails uitzetten bij Mijn rooster in de app.",
  ].join("\n");

  const rows = lines
    .map((l) => {
      const what =
        l.kind === "nieuw"
          ? `ingepland als <strong>${escapeHtml(l.newText)}</strong>`
          : l.kind === "vervallen"
            ? `je dienst vervalt <span style="color:#666">(was ${escapeHtml(l.oldText)})</span>`
            : `gewijzigd van ${escapeHtml(l.oldText)} naar <strong>${escapeHtml(l.newText)}</strong>`;
      return `<tr><td style="padding:6px 12px 6px 0;white-space:nowrap;vertical-align:top"><strong>${escapeHtml(dayLabel(l.date))}</strong></td><td style="padding:6px 0">${what}</td></tr>`;
    })
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1c2521;max-width:560px">
<p>Hoi ${escapeHtml(name)},</p>
<p>${escapeHtml(heading)}:</p>
<table style="border-collapse:collapse">${rows}</table>
${link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f6e63;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">Bekijk je rooster</a></p>` : ""}
<p style="color:#666;font-size:12px">Je kunt deze e-mails uitzetten bij Mijn rooster in de app.</p>
</div>`;
  return { subject, text, html };
}

let running = false;

/**
 * Verstuurt de gebundelde mails: per medewerker één mail met alle wijzigingen,
 * zodra de laatste wijziging voor die medewerker lang genoeg geleden is.
 * Geeft het aantal verstuurde mails terug.
 */
export async function processDueNotifications(options: { force?: boolean } = {}) {
  if (running || !isMailConfigured()) return 0;
  running = true;
  let sent = 0;
  try {
    const cutoff = new Date(Date.now() - (options.force ? 0 : quietMinutes() * 60_000));
    const today = todayAmsterdam();

    // Dagen die inmiddels geweest zijn hoeven niet meer gemaild.
    await prisma.rosterChange.deleteMany({ where: { date: { lt: today } } });

    const changes = await prisma.rosterChange.findMany({
      where: { attempts: { lt: MAX_ATTEMPTS } },
      include: { employee: { include: { user: true } } },
      orderBy: { date: "asc" },
    });
    const byEmployee = new Map<string, typeof changes>();
    for (const c of changes) byEmployee.set(c.employeeId, [...(byEmployee.get(c.employeeId) ?? []), c]);

    const shiftTypes = new Map((await prisma.shiftType.findMany()).map((s) => [s.id, s]));
    const toShift = (id: string | null): Shift => (id ? (shiftTypes.get(id) ?? null) : null);

    for (const [, list] of byEmployee) {
      const newest = Math.max(...list.map((c) => c.updatedAt.getTime()));
      if (newest > cutoff.getTime()) continue; // er wordt nog aan gewerkt
      const employee = list[0].employee;
      const user = employee.user;
      const ids = list.map((c) => c.id);

      // Geen account, uitgezet, of geen mail gewenst: wachtrij opruimen zonder te mailen.
      if (!user || !user.active || !user.emailNotifications || !user.email) {
        await prisma.rosterChange.deleteMany({ where: { id: { in: ids } } });
        continue;
      }

      const lines: Line[] = list.map((c) => ({
        date: c.date,
        kind: !c.oldShiftTypeId ? "nieuw" : !c.newShiftTypeId ? "vervallen" : "gewijzigd",
        oldText: describeShift(toShift(c.oldShiftTypeId)),
        newText: describeShift(toShift(c.newShiftTypeId)),
      }));

      try {
        await sendMail({ to: user.email, ...buildMail(employee.name, lines) });
        await prisma.rosterChange.deleteMany({ where: { id: { in: ids } } });
        sent += 1;
      } catch (error) {
        console.error(`Mail naar ${employee.name} mislukt:`, error instanceof Error ? error.message : error);
        await prisma.rosterChange.updateMany({ where: { id: { in: ids } }, data: { attempts: { increment: 1 } } });
      }
    }
  } finally {
    running = false;
  }
  return sent;
}

/** Hoeveel mails wachten er nog (voor de statusregel bij Gebruikers)? */
export async function pendingNotificationCount() {
  const rows = await prisma.rosterChange.findMany({
    where: { date: { gte: todayAmsterdam() } },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  return rows.length;
}

