import { prisma } from "@/lib/prisma";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";
import { quietMinutes } from "@/lib/notifications";
import { addDays, formatDayMonth, isoWeek, startOfWeek, toISODate, weekdayFull } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";
import { employeeShiftHours, loadHoursOverrides } from "@/lib/shift-hours-overrides";

/*
 * Mail aan de medewerker over de gewerkte uren:
 *  - bij goedkeuren van een week of maand door de administratie: meteen één mail met de uren per dag en het totaal;
 *  - bij aanpassen van uren in een al goedgekeurde week of maand: per dag de nettowijziging in de wachtrij
 *    (HoursChange), en na de wachttijd één mail per medewerker per week met oud → nieuw.
 * Mislukt de mail, dan blijft de goedkeuring of aanpassing gewoon staan.
 */

export type MailOutcome = "sent" | "failed" | "no-address" | "not-configured" | "self";

const MAX_ATTEMPTS = 5;
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const dayLabel = (d: Date) => `${weekdayFull(d)} ${formatDayMonth(d)}`;
const wrap = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1c2521;max-width:560px">${inner}</div>`;
const td = "padding:4px 12px 4px 0;vertical-align:top";

export function weekLabel(monday: Date) {
  return `week ${isoWeek(monday)} (${formatDayMonth(monday)} t/m ${formatDayMonth(addDays(monday, 6))})`;
}

export function formatDateTime(d: Date) {
  return d.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Mededeling voor de administratie na goedkeuren. */
export function outcomeMessage(outcome: MailOutcome, name: string) {
  switch (outcome) {
    case "sent":
      return ` ${name} heeft een mail gekregen.`;
    case "failed":
      return ` Let op: de mail aan ${name} is niet gelukt (de goedkeuring staat wel).`;
    case "no-address":
      return ` ${name} heeft geen actief account met e-mailadres, dus er is geen mail verstuurd.`;
    case "not-configured":
      return " Er is geen mail verstuurd: mail is niet ingesteld.";
    default:
      return "";
  }
}

/** Effectieve uren per dag: de geregistreerde uren, anders de geplande uren (alleen tot en met vandaag). */
export async function effectiveByDay(employeeId: string, from: Date, toInclusive: Date) {
  const afterEnd = addDays(toInclusive, 1);
  const [assignments, entries, overrides] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { employeeId, date: { gte: from, lt: afterEnd } }, include: { shiftType: true } }),
    prisma.timeEntry.findMany({ where: { employeeId, date: { gte: from, lt: afterEnd } }, select: { date: true, hours: true } }),
    loadHoursOverrides([employeeId]),
  ]);
  const todayISO = toISODate(todayAmsterdam());
  const byAssignment = new Map(assignments.map((a) => [toISODate(a.date), a]));
  const byEntry = new Map(entries.map((e) => [toISODate(e.date), e.hours]));
  const out: { date: Date; iso: string; code: string | null; hours: number }[] = [];
  for (let d = from; d <= toInclusive; d = addDays(d, 1)) {
    const iso = toISODate(d);
    const a = byAssignment.get(iso);
    const entry = byEntry.get(iso);
    const hours = entry ?? (a && iso <= todayISO ? employeeShiftHours(overrides, employeeId, a.shiftType, iso) : 0);
    out.push({ date: d, iso, code: a?.shiftType.code ?? null, hours });
  }
  return out;
}

export async function dayHours(employeeId: string, date: Date) {
  return (await effectiveByDay(employeeId, date, date))[0]?.hours ?? 0;
}

/** Valt de dag in een goedgekeurde week of een goedgekeurde maand? */
export async function isApprovedDay(employeeId: string, date: Date) {
  const [week, month] = await Promise.all([
    prisma.weekSubmission.findUnique({ where: { employeeId_weekStart: { employeeId, weekStart: startOfWeek(date) } }, select: { status: true } }),
    prisma.timesheet.findUnique({
      where: { employeeId_year_month: { employeeId, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 } },
      select: { status: true },
    }),
  ]);
  return week?.status === "APPROVED" || month?.status === "APPROVED";
}

/** Mailadres van de medewerker (alleen een actief account), of null. */
export async function employeeAddress(employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true, user: { select: { email: true, active: true } } } });
  if (!employee) return null;
  return { name: employee.name, email: employee.user?.active && employee.user.email ? employee.user.email : null };
}

// ---------- Mail bij goedkeuren ----------

export function buildApprovalMail(input: {
  name: string;
  periodLabel: string;
  days: { date: Date; code: string | null; hours: number }[];
  note: string | null;
  approverName: string | null;
}) {
  const days = input.days.filter((d) => d.code || d.hours > 0);
  const total = days.reduce((sum, d) => sum + d.hours, 0);
  const subject = `Je uren van ${input.periodLabel} zijn goedgekeurd`;
  const by = input.approverName ? ` door ${input.approverName}` : "";
  const text = [
    `Hoi ${input.name},`,
    "",
    `Je gewerkte uren van ${input.periodLabel} zijn goedgekeurd${by}.`,
    "",
    ...days.map((d) => `- ${dayLabel(d.date)}${d.code ? ` (${d.code})` : ""}: ${fmt(d.hours)} uur`),
    "",
    `Totaal: ${fmt(total)} uur`,
    ...(input.note ? ["", `Opmerking van de administratie: ${input.note}`] : []),
    "",
    "Klopt er iets niet? Neem contact op met de administratie.",
  ].join("\n");
  const rows = days
    .map(
      (d) =>
        `<tr><td style="${td};white-space:nowrap">${escapeHtml(dayLabel(d.date))}</td><td style="${td};color:#5b6660">${escapeHtml(d.code ?? "")}</td><td style="${td};text-align:right">${fmt(d.hours)} uur</td></tr>`,
    )
    .join("");
  const html = wrap(
    `<p>Hoi ${escapeHtml(input.name)},</p>` +
      `<p>Je gewerkte uren van <strong>${escapeHtml(input.periodLabel)}</strong> zijn goedgekeurd${escapeHtml(by)}.</p>` +
      `<table style="border-collapse:collapse">${rows}<tr><td style="${td};font-weight:bold" colspan="2">Totaal</td><td style="${td};text-align:right;font-weight:bold">${fmt(total)} uur</td></tr></table>` +
      (input.note ? `<p><strong>Opmerking van de administratie:</strong> ${escapeHtml(input.note)}</p>` : "") +
      '<p style="color:#666;font-size:12px">Klopt er iets niet? Neem contact op met de administratie.</p>',
  );
  return { subject, text, html };
}

/** Stuurt meteen de mail over een goedgekeurde periode. Gooit nooit: de uitkomst gaat terug naar de administratie. */
export async function sendApprovalMail(input: {
  employeeId: string;
  from: Date;
  toInclusive: Date;
  periodLabel: string;
  note: string | null;
  approverName: string | null;
  approverEmployeeId: string | null;
}): Promise<MailOutcome> {
  try {
    if (input.approverEmployeeId === input.employeeId) return "self";
    if (!(await isMailConfigured())) return "not-configured";
    const address = await employeeAddress(input.employeeId);
    if (!address?.email) return "no-address";
    const days = await effectiveByDay(input.employeeId, input.from, input.toInclusive);
    await sendMail({ to: address.email, ...buildApprovalMail({ name: address.name, periodLabel: input.periodLabel, days, note: input.note, approverName: input.approverName }) });
    return "sent";
  } catch (error) {
    console.error("Mail over goedgekeurde uren mislukt:", error instanceof Error ? error.message : "onbekende fout");
    return "failed";
  }
}

// ---------- Aanpassing na goedkeuring (gebundeld per week) ----------

/** Legt de nettowijziging van een dag vast. Teruggezet naar de oude uren = uit de wachtrij. */
export async function recordHoursChange(input: {
  employeeId: string;
  date: Date;
  oldHours: number;
  newHours: number;
  changedById: string;
  changedByName: string | null;
}) {
  const key = { employeeId_date: { employeeId: input.employeeId, date: input.date } };
  const existing = await prisma.hoursChange.findUnique({ where: key });
  const oldHours = existing ? existing.oldHours : input.oldHours;
  if (Math.abs(oldHours - input.newHours) < 0.001) {
    if (existing) await prisma.hoursChange.delete({ where: key });
    return;
  }
  const weekStart = startOfWeek(input.date);
  // Een al ingevulde opmerking voor deze week geldt ook voor de nieuwe dag.
  const weekNote = existing ? existing.note : (await prisma.hoursChange.findFirst({ where: { employeeId: input.employeeId, weekStart, note: { not: null } }, select: { note: true } }))?.note ?? null;
  await prisma.hoursChange.upsert({
    where: key,
    update: { newHours: input.newHours, changedById: input.changedById, changedByName: input.changedByName, attempts: 0 },
    create: {
      employeeId: input.employeeId,
      date: input.date,
      weekStart,
      oldHours,
      newHours: input.newHours,
      changedById: input.changedById,
      changedByName: input.changedByName,
      note: weekNote,
    },
  });
}

export async function setHoursChangeNote(employeeId: string, weekStart: Date, note: string | null) {
  const result = await prisma.hoursChange.updateMany({ where: { employeeId, weekStart }, data: { note } });
  return result.count;
}

export async function clearHoursChanges(employeeId: string, from: Date, toInclusive: Date) {
  await prisma.hoursChange.deleteMany({ where: { employeeId, date: { gte: from, lt: addDays(toInclusive, 1) } } });
}

/** Wachtende aanpassingen per week (maandag-ISO), voor de weergave bij de week. */
export async function pendingHoursChanges(employeeId: string, from: Date, toInclusive: Date) {
  const rows = await prisma.hoursChange.findMany({ where: { employeeId, weekStart: { gte: from, lte: toInclusive } } });
  const minutes = await quietMinutes();
  const out: Record<string, { count: number; note: string | null; failed: boolean; sendsAt: string }> = {};
  for (const r of rows) {
    const iso = toISODate(r.weekStart);
    const cur = out[iso] ?? { count: 0, note: null, failed: false, sendsAt: "" };
    cur.count += 1;
    cur.note = cur.note ?? r.note;
    if (r.attempts >= MAX_ATTEMPTS) cur.failed = true;
    const at = new Date(r.updatedAt.getTime() + minutes * 60_000).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
    if (at > cur.sendsAt) cur.sendsAt = at;
    out[iso] = cur;
  }
  return out;
}

export function buildChangeMail(input: {
  name: string;
  weekStart: Date;
  lines: { date: Date; oldHours: number; newHours: number }[];
  oldTotal: number;
  newTotal: number;
  changedByName: string | null;
  changedAt: Date;
  note: string | null;
}) {
  const week = weekLabel(input.weekStart);
  const subject = `Je goedgekeurde uren van week ${isoWeek(input.weekStart)} zijn aangepast`;
  const who = input.changedByName ? ` door ${input.changedByName}` : " door de administratie";
  const when = formatDateTime(input.changedAt);
  const text = [
    `Hoi ${input.name},`,
    "",
    `Je goedgekeurde uren van ${week} zijn aangepast${who} (${when}).`,
    "",
    ...input.lines.map((l) => `- ${dayLabel(l.date)}: ${fmt(l.oldHours)} → ${fmt(l.newHours)} uur`),
    "",
    `Totaal van de week: ${fmt(input.oldTotal)} → ${fmt(input.newTotal)} uur`,
    ...(input.note ? ["", `Opmerking van de administratie: ${input.note}`] : []),
    "",
    "Klopt er iets niet? Neem contact op met de administratie.",
  ].join("\n");
  const rows = input.lines
    .map(
      (l) =>
        `<tr><td style="${td};white-space:nowrap">${escapeHtml(dayLabel(l.date))}</td><td style="${td};text-align:right;color:#666">${fmt(l.oldHours)}</td><td style="${td}">→</td><td style="${td};text-align:right"><strong>${fmt(l.newHours)}</strong> uur</td></tr>`,
    )
    .join("");
  const html = wrap(
    `<p>Hoi ${escapeHtml(input.name)},</p>` +
      `<p>Je goedgekeurde uren van <strong>${escapeHtml(week)}</strong> zijn aangepast${escapeHtml(who)} (${escapeHtml(when)}).</p>` +
      `<table style="border-collapse:collapse">${rows}<tr><td style="${td};font-weight:bold">Totaal week</td><td style="${td};text-align:right;color:#666">${fmt(input.oldTotal)}</td><td style="${td}">→</td><td style="${td};text-align:right"><strong>${fmt(input.newTotal)}</strong> uur</td></tr></table>` +
      (input.note ? `<p><strong>Opmerking van de administratie:</strong> ${escapeHtml(input.note)}</p>` : "") +
      '<p style="color:#666;font-size:12px">Klopt er iets niet? Neem contact op met de administratie.</p>',
  );
  return { subject, text, html };
}

let running = false;

/** Verstuurt per medewerker per week één mail zodra de laatste aanpassing lang genoeg geleden is. */
export async function processHoursChanges(options: { force?: boolean } = {}) {
  if (running || !(await isMailConfigured())) return 0;
  running = true;
  let sent = 0;
  try {
    const cutoff = Date.now() - (options.force ? 0 : (await quietMinutes()) * 60_000);
    const rows = await prisma.hoursChange.findMany({
      where: { attempts: { lt: MAX_ATTEMPTS } },
      include: { employee: { select: { name: true, user: { select: { email: true, active: true } } } } },
      orderBy: { date: "asc" },
    });
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.employeeId}|${toISODate(r.weekStart)}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const list of groups.values()) {
      const latest = list.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
      if (latest.updatedAt.getTime() > cutoff) continue; // er wordt nog aan gewerkt
      const ids = list.map((r) => r.id);
      const { employee, employeeId, weekStart } = list[0];
      const email = employee.user?.active ? employee.user.email : null;
      if (!email) {
        await prisma.hoursChange.deleteMany({ where: { id: { in: ids } } });
        continue;
      }
      try {
        const week = await effectiveByDay(employeeId, weekStart, addDays(weekStart, 6));
        const newTotal = week.reduce((sum, d) => sum + d.hours, 0);
        const oldTotal = newTotal - list.reduce((sum, r) => sum + r.newHours - r.oldHours, 0);
        await sendMail({
          to: email,
          ...buildChangeMail({
            name: employee.name,
            weekStart,
            lines: list.map((r) => ({ date: r.date, oldHours: r.oldHours, newHours: r.newHours })),
            oldTotal,
            newTotal,
            changedByName: latest.changedByName,
            changedAt: latest.updatedAt,
            note: list.find((r) => r.note)?.note ?? null,
          }),
        });
        await prisma.hoursChange.deleteMany({ where: { id: { in: ids } } });
        sent += 1;
      } catch (error) {
        console.error(`Mail over aangepaste uren aan ${employee.name} mislukt:`, error instanceof Error ? error.message : "onbekende fout");
        await prisma.hoursChange.updateMany({ where: { id: { in: ids } }, data: { attempts: { increment: 1 } } });
      }
    }
  } finally {
    running = false;
  }
  return sent;
}

export async function pendingHoursChangeCount() {
  const rows = await prisma.hoursChange.findMany({ where: { attempts: { lt: MAX_ATTEMPTS } }, select: { employeeId: true, weekStart: true } });
  return new Set(rows.map((r) => `${r.employeeId}|${toISODate(r.weekStart)}`)).size;
}
