import { prisma } from "@/lib/prisma";
import { daysInMonth, toISODate } from "@/lib/format";
import { shiftHours } from "@/lib/hours";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";
import type { TimesheetStatus } from "@prisma/client";

export const STATUS_LABEL: Record<TimesheetStatus | "NONE", string> = {
  NONE: "Niet ingediend",
  DRAFT: "Niet ingediend",
  SUBMITTED: "Ingediend",
  APPROVED: "Goedgekeurd",
  RETURNED: "Teruggestuurd",
};

/** Jaar en maand uit de URL, met de huidige maand als standaard. */
export function parseMonth(params: { year?: string; month?: string }) {
  const today = todayAmsterdam();
  const year = Number(params.year) || today.getUTCFullYear();
  const month = Number(params.month);
  return { year, month: month >= 1 && month <= 12 ? month : today.getUTCMonth() + 1 };
}

/** Uren uit invoer zoals "7,5" of "7.5". Leeg = null. Ongeldig = fout. */
export function parseHoursInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim().replace(",", ".");
  if (!str) return null;
  const hours = Number(str);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    throw new Error("Uren moeten een getal tussen 0 en 24 zijn.");
  }
  return Math.round(hours * 100) / 100;
}

export type DayRow = {
  dateISO: string;
  code: string | null;
  label: string | null;
  planned: number;
  entry: { hours: number; note: string | null; editedByName: string | null } | null;
};

export type SheetInfo = {
  status: TimesheetStatus;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionNote: string | null;
};

const EMPTY_SHEET: SheetInfo = { status: "DRAFT", submittedAt: null, decidedAt: null, decidedByName: null, decisionNote: null };

/** Effectieve uren van een dag: de bevestigde uren, anders de geplande uren (alleen voor dagen tot en met vandaag). */
export function effectiveHours(row: DayRow, todayISO: string) {
  if (row.entry) return row.entry.hours;
  return row.dateISO <= todayISO ? row.planned : 0;
}

/** Alle dagen van een maand voor één medewerker, met geplande uren en eventuele registratie. */
export async function loadEmployeeMonth(employeeId: string, year: number, month: number) {
  const days = daysInMonth(year, month);
  const from = days[0];
  const to = new Date(days[days.length - 1]);
  to.setUTCDate(to.getUTCDate() + 1);

  const [assignments, entries, sheet] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { employeeId, date: { gte: from, lt: to } },
      include: { shiftType: true },
    }),
    prisma.timeEntry.findMany({
      where: { employeeId, date: { gte: from, lt: to } },
      include: { editedBy: { select: { name: true, email: true } } },
    }),
    prisma.timesheet.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
      include: { decidedBy: { select: { name: true, email: true } } },
    }),
  ]);
  const byDate = new Map(assignments.map((a) => [toISODate(a.date), a]));
  const entryByDate = new Map(entries.map((e) => [toISODate(e.date), e]));

  const rows: DayRow[] = days.map((day) => {
    const dateISO = toISODate(day);
    const assignment = byDate.get(dateISO);
    const entry = entryByDate.get(dateISO);
    return {
      dateISO,
      code: assignment?.shiftType.code ?? null,
      label: assignment?.shiftType.label ?? null,
      planned: assignment ? shiftHours(assignment.shiftType) : 0,
      entry: entry
        ? {
            hours: entry.hours,
            note: entry.note,
            editedByName: entry.editedBy ? (entry.editedBy.name ?? entry.editedBy.email) : null,
          }
        : null,
    };
  });

  const info: SheetInfo = sheet
    ? {
        status: sheet.status,
        submittedAt: sheet.submittedAt,
        decidedAt: sheet.decidedAt,
        decidedByName: sheet.decidedBy ? (sheet.decidedBy.name ?? sheet.decidedBy.email) : null,
        decisionNote: sheet.decisionNote,
      }
    : EMPTY_SHEET;
  return { rows, sheet: info };
}

/** Maakt voor alle dagen tot en met vandaag zonder registratie een regel met de geplande uren. */
export async function confirmPlannedDays(employeeId: string, year: number, month: number, editedById: string | null) {
  const { rows } = await loadEmployeeMonth(employeeId, year, month);
  const todayISO = toISODate(todayAmsterdam());
  const missing = rows.filter((r) => !r.entry && r.planned > 0 && r.dateISO <= todayISO);
  if (missing.length === 0) return 0;
  await prisma.timeEntry.createMany({
    data: missing.map((r) => ({
      employeeId,
      date: new Date(`${r.dateISO}T00:00:00.000Z`),
      hours: r.planned,
      plannedHours: r.planned,
      editedById,
    })),
    skipDuplicates: true,
  });
  return missing.length;
}

export type OverviewRow = {
  employeeId: string;
  name: string;
  colorGroup: string | null;
  planned: number;
  worked: number;
  status: TimesheetStatus | "NONE";
  unconfirmedDays: number;
};

/** Maandoverzicht voor alle medewerkers die in die maand uren hebben of actief zijn. */
export async function loadOverview(year: number, month: number): Promise<OverviewRow[]> {
  const days = daysInMonth(year, month);
  const from = days[0];
  const to = new Date(days[days.length - 1]);
  to.setUTCDate(to.getUTCDate() + 1);
  const todayISO = toISODate(todayAmsterdam());

  const [employeesRaw, groups, assignments, entries, sheets] = await Promise.all([
    prisma.employee.findMany({ select: { id: true, name: true, active: true, colorGroup: true, experience: true } }),
    ensureColorGroups(),
    prisma.shiftAssignment.findMany({ where: { date: { gte: from, lt: to } }, include: { shiftType: true } }),
    prisma.timeEntry.findMany({ where: { date: { gte: from, lt: to } } }),
    prisma.timesheet.findMany({ where: { year, month } }),
  ]);

  // Zelfde volgorde als in het rooster: kleurgroep, dan ervaring, dan naam.
  const employees = sortEmployees(employeesRaw, groups);
  const rows: OverviewRow[] = [];
  for (const employee of employees) {
    const mine = assignments.filter((a) => a.employeeId === employee.id);
    const myEntries = new Map(entries.filter((e) => e.employeeId === employee.id).map((e) => [toISODate(e.date), e]));
    let planned = 0;
    let worked = 0;
    let unconfirmedDays = 0;
    const plannedByDate = new Map<string, number>();
    for (const a of mine) {
      const hours = shiftHours(a.shiftType);
      plannedByDate.set(toISODate(a.date), hours);
      planned += hours;
    }
    for (const day of days) {
      const iso = toISODate(day);
      const entry = myEntries.get(iso);
      if (entry) worked += entry.hours;
      else if (iso <= todayISO && (plannedByDate.get(iso) ?? 0) > 0) {
        worked += plannedByDate.get(iso) ?? 0;
        unconfirmedDays += 1;
      }
    }
    const status = sheets.find((s) => s.employeeId === employee.id)?.status ?? "NONE";
    // Inactieve medewerkers zonder uren of planning in deze maand laten we weg.
    if (!employee.active && planned === 0 && worked === 0) continue;
    if (planned === 0 && worked === 0 && status === "NONE" && !employee.active) continue;
    rows.push({ employeeId: employee.id, name: employee.name, colorGroup: employee.colorGroup, planned, worked, status, unconfirmedDays });
  }
  return rows;
}

/**
 * Slaat de gewerkte uren van één dag op (of verwijdert de registratie als zowel uren als notitie leeg zijn,
 * zodat de dag terugvalt op het voorstel uit het rooster). Gedeeld door medewerker en administratie; de
 * aanroeper controleert de rechten.
 */
export async function writeEntry(employeeId: string, date: Date, hoursInput: string | null, note: string, editedById: string) {
  const hours = parseHoursInput(hoursInput);
  const cleanNote = note.trim().slice(0, 300) || null;
  if (hours === null && !cleanNote) {
    await prisma.timeEntry.deleteMany({ where: { employeeId, date } });
    return;
  }
  const assignment = await prisma.shiftAssignment.findFirst({
    where: { employeeId, date },
    include: { shiftType: true },
  });
  const planned = assignment ? shiftHours(assignment.shiftType) : 0;
  const worked = hours ?? planned;
  await prisma.timeEntry.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: { hours: worked, plannedHours: planned, note: cleanNote, editedById },
    create: { employeeId, date, hours: worked, plannedHours: planned, note: cleanNote, editedById },
  });
}
