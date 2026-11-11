import { prisma } from "@/lib/prisma";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";
import { addDays, formatRange, toISODate } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";
import type { AvailabilityStatus } from "@prisma/client";

const MAX_ATTEMPTS = 5;

function quietMinutes() {
  const value = Number(process.env.NOTIFY_DELAY_MINUTES);
  return Number.isFinite(value) && value >= 0 ? value : 10;
}

function appLink(path: string) {
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  return base ? `${base}${path}` : "";
}

/** Actieve planners die meldingen willen, eventueel zonder één bepaalde gebruiker. */
async function plannerRecipients(excludeEmployeeId?: string) {
  const planners = await prisma.user.findMany({
    where: { role: "ADMIN", active: true, plannerNotifications: true },
    select: { email: true, name: true, employeeId: true },
  });
  return planners.filter((p) => p.email && !(excludeEmployeeId && p.employeeId === excludeEmployeeId));
}

const wrap = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1c2521;max-width:560px">${inner}</div>`;
const button = (href: string, label: string) =>
  href
    ? `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#2f6e63;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>`
    : "";
const footer = `<p style="color:#666;font-size:12px">Je kunt deze e-mails uitzetten bij Mijn rooster in de app.</p>`;

/** Meldt alle planners (meteen) dat er een nieuwe verlofaanvraag is. Mislukken mag de aanvraag niet blokkeren. */
export async function notifyPlannersOfLeaveRequest(requestId: string) {
  if (!isMailConfigured()) return;
  try {
    const request = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { employee: true },
    });
    if (!request || request.status !== "PENDING") return;
    const planners = await plannerRecipients(request.employeeId);
    if (planners.length === 0) return;

    const range = formatRange(request.startDate, request.endDate);
    const link = appLink("/verlof/overzicht");
    const weekends = request.includeWeekends ? "inclusief weekenden" : "zonder weekenden";
    const subject = `Verlofaanvraag van ${request.employee.name}: ${range}`;
    const text = [
      `${request.employee.name} vraagt verlof aan.`,
      "",
      `Periode: ${range} (${weekends})`,
      ...(request.note ? [`Opmerking: ${request.note}`] : []),
      "",
      ...(link ? [`Beoordelen: ${link}`, ""] : []),
      "Je kunt deze e-mails uitzetten bij Mijn rooster in de app.",
    ].join("\n");
    const html = wrap(
      `<p><strong>${escapeHtml(request.employee.name)}</strong> vraagt verlof aan.</p>
<p>Periode: <strong>${escapeHtml(range)}</strong> (${weekends})${
        request.note ? `<br>Opmerking: ${escapeHtml(request.note)}` : ""
      }</p>${button(link, "Beoordelen")}${footer}`,
    );

    for (const planner of planners) {
      await sendMail({ to: planner.email, subject, text, html }).catch((error) =>
        console.error("Mail over verlofaanvraag mislukt:", error instanceof Error ? error.message : error),
      );
    }
  } catch (error) {
    console.error("Melding verlofaanvraag mislukt:", error);
  }
}

/**
 * Legt vast dat een medewerker zijn beschikbaarheid op een dag heeft aangepast.
 * Per dag bewaren we alleen de nettowijziging; terugzetten naar hoe het was geeft geen mail.
 */
export async function recordAvailabilityChange(input: {
  employeeId: string;
  date: Date;
  oldStatus: AvailabilityStatus | null;
  newStatus: AvailabilityStatus | null;
}) {
  if (input.date < todayAmsterdam()) return;
  const key = { employeeId_date: { employeeId: input.employeeId, date: input.date } };
  const existing = await prisma.availabilityChange.findUnique({ where: key });
  const oldStatus = existing ? existing.oldStatus : input.oldStatus;
  if (oldStatus === input.newStatus) {
    if (existing) await prisma.availabilityChange.delete({ where: key });
    return;
  }
  await prisma.availabilityChange.upsert({
    where: key,
    update: { newStatus: input.newStatus, attempts: 0 },
    create: { employeeId: input.employeeId, date: input.date, oldStatus, newStatus: input.newStatus },
  });
}

const STATUS_TEXT: Record<AvailabilityStatus | "NONE", string> = {
  AVAILABLE: "hele dag beschikbaar",
  MORNING: "alleen ochtend beschikbaar",
  AFTERNOON: "alleen middag beschikbaar",
  UNAVAILABLE: "niet beschikbaar",
  NONE: "doorgave verwijderd",
};

type Row = { date: Date; newStatus: AvailabilityStatus | null; conflict: boolean };
type Part = { start: Date; end: Date; status: AvailabilityStatus | "NONE"; conflict: boolean };

/** Voegt opeenvolgende dagen met dezelfde nieuwe keuze samen, zodat een hele maand niet 30 regels wordt. */
function toRanges(rows: Row[]): Part[] {
  const parts: Part[] = [];
  for (const row of [...rows].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const status = row.newStatus ?? "NONE";
    const last = parts[parts.length - 1];
    if (last && last.status === status && toISODate(addDays(last.end, 1)) === toISODate(row.date)) {
      last.end = row.date;
      last.conflict = last.conflict || row.conflict;
    } else {
      parts.push({ start: row.date, end: row.date, status, conflict: row.conflict });
    }
  }
  return parts;
}

let running = false;

/**
 * Verstuurt de gebundelde mail aan de planners over aangepaste beschikbaarheid, zodra een medewerker
 * lang genoeg niets meer heeft aangepast. Geeft het aantal verstuurde mails terug.
 */
export async function processAvailabilityAlerts(options: { force?: boolean } = {}) {
  if (running || !isMailConfigured()) return 0;
  running = true;
  let sent = 0;
  try {
    const cutoff = Date.now() - (options.force ? 0 : quietMinutes() * 60_000);
    await prisma.availabilityChange.deleteMany({ where: { date: { lt: todayAmsterdam() } } });

    const changes = await prisma.availabilityChange.findMany({
      where: { attempts: { lt: MAX_ATTEMPTS } },
      include: { employee: true },
      orderBy: { date: "asc" },
    });
    const byEmployee = new Map<string, typeof changes>();
    for (const c of changes) byEmployee.set(c.employeeId, [...(byEmployee.get(c.employeeId) ?? []), c]);

    // Alleen medewerkers bij wie het al even stil is.
    const due = [...byEmployee.values()].filter(
      (list) => Math.max(...list.map((c) => c.updatedAt.getTime())) <= cutoff,
    );
    if (due.length === 0) return 0;

    // Is iemand die zich nu niet beschikbaar meldt al wel ingepland? Dat is voor de planner het belangrijkst.
    const unavailable = due.flatMap((list) => list.filter((c) => c.newStatus === "UNAVAILABLE"));
    const scheduled = unavailable.length
      ? await prisma.shiftAssignment.findMany({
          where: {
            OR: unavailable.map((c) => ({ employeeId: c.employeeId, date: c.date })),
            shiftType: { code: { not: "V" } },
          },
          select: { employeeId: true, date: true },
        })
      : [];
    const scheduledKeys = new Set(scheduled.map((a) => `${a.employeeId}_${toISODate(a.date)}`));

    for (const list of due) {
      const employee = list[0].employee;
      const ids = list.map((c) => c.id);
      const planners = await plannerRecipients(employee.id);
      if (planners.length === 0) {
        await prisma.availabilityChange.deleteMany({ where: { id: { in: ids } } });
        continue;
      }

      const parts = toRanges(
        list.map((c) => ({
          date: c.date,
          newStatus: c.newStatus,
          conflict: c.newStatus === "UNAVAILABLE" && scheduledKeys.has(`${c.employeeId}_${toISODate(c.date)}`),
        })),
      );
      const describe = (p: Part) =>
        `${formatRange(p.start, p.end)}: ${STATUS_TEXT[p.status]}${p.conflict ? " — let op: staat al ingepland" : ""}`;
      const link = appLink("/rooster");
      const subject = `${employee.name} heeft de beschikbaarheid aangepast`;
      const text = [
        `${employee.name} heeft de beschikbaarheid aangepast:`,
        "",
        ...parts.map((p) => `- ${describe(p)}`),
        "",
        ...(link ? [`Naar het rooster: ${link}`, ""] : []),
        "Je kunt deze e-mails uitzetten bij Mijn rooster in de app.",
      ].join("\n");
      const rows = parts
        .map(
          (p) =>
            `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap"><strong>${escapeHtml(formatRange(p.start, p.end))}</strong></td><td style="padding:6px 0">${escapeHtml(STATUS_TEXT[p.status])}${
              p.conflict ? ` <span style="color:#b42318;font-weight:bold">— let op: staat al ingepland</span>` : ""
            }</td></tr>`,
        )
        .join("");
      const html = wrap(
        `<p><strong>${escapeHtml(employee.name)}</strong> heeft de beschikbaarheid aangepast:</p><table style="border-collapse:collapse">${rows}</table>${button(link, "Naar het rooster")}${footer}`,
      );

      let delivered = 0;
      for (const planner of planners) {
        try {
          await sendMail({ to: planner.email, subject, text, html });
          delivered += 1;
        } catch (error) {
          console.error(`Mail naar ${planner.email} mislukt:`, error instanceof Error ? error.message : error);
        }
      }
      if (delivered > 0) {
        await prisma.availabilityChange.deleteMany({ where: { id: { in: ids } } });
        sent += delivered;
      } else {
        await prisma.availabilityChange.updateMany({ where: { id: { in: ids } }, data: { attempts: { increment: 1 } } });
      }
    }
  } finally {
    running = false;
  }
  return sent;
}

/** Hoeveel medewerkers hebben een aangepaste beschikbaarheid die nog gemaild moet worden? */
export async function pendingAvailabilityCount() {
  const rows = await prisma.availabilityChange.findMany({
    where: { date: { gte: todayAmsterdam() } },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  return rows.length;
}
