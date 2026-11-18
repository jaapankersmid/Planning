import { prisma } from "@/lib/prisma";
import { addDays, daysInMonth, isoWeek, startOfWeek, toISODate } from "@/lib/format";
import { shiftHours } from "@/lib/hours";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";
import type { TimesheetStatus } from "@prisma/client";
import { sortShiftTypes } from "@/lib/shift-order";
import { employeeShiftHours, employeeShiftHoursInfo, loadHoursOverrides, rulesFor } from "@/lib/shift-hours-overrides";

export { STATUS_LABEL, isLockedStatus } from "@/lib/timesheet-labels";

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
  /** De maandag van de week waarin deze dag valt. */
  weekStartISO: string;
  code: string | null;
  label: string | null;
  planned: number;
  /** De geplande uren komen uit een afwijking voor deze medewerker (bv. A = 9 uur). */
  plannedOverride?: boolean;
  entry: {
    hours: number;
    note: string | null;
    editedByName: string | null;
    /** Volgens de medewerker gewerkt als een andere dienst dan in het rooster (null = zoals gepland). */
    workedShiftTypeId: string | null;
    workedCode: string | null;
    workedLabel: string | null;
    /** De medewerker meldt dat hij (een deel van) de dag ziek was; hours = wat hij nog werkte. */
    sickReported: boolean;
  } | null;
  /** Valt de dag in de getoonde maand? Voor de dagen van een halve week uit de buurmaand is dit false. */
  inMonth: boolean;
};

export type SheetInfo = {
  status: TimesheetStatus;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionNote: string | null;
};

/** Een week (ma t/m zo) van een medewerker: status van het wekelijks indienen en de totalen. */
export type WeekInfo = {
  startISO: string;
  endISO: string;
  weekNo: number;
  status: TimesheetStatus;
  decidedByName: string | null;
  decisionNote: string | null;
  /** Totalen van de hele week. */
  planned: number;
  worked: number;
  /** Alleen de dagen van de week die in de getoonde maand vallen. */
  plannedInMonth: number;
  workedInMonth: number;
  /** De week loopt over de maandgrens. */
  partial: boolean;
};

const EMPTY_SHEET: SheetInfo = { status: "DRAFT", submittedAt: null, decidedAt: null, decidedByName: null, decisionNote: null };

/** Diensten die een medewerker kan kiezen bij "andere dienst gewerkt" (actief; Ziek zet alleen de planner). */
export async function loadShiftOptions(employeeId?: string) {
  const [types, overrides] = await Promise.all([
    prisma.shiftType.findMany({ where: { active: true, code: { not: "Z" } }, orderBy: { code: "asc" } }),
    employeeId ? loadHoursOverrides([employeeId]) : null,
  ]);
  const rules = overrides && employeeId ? rulesFor(overrides, employeeId) : {};
  // "Kiesbaar voor medewerkers" geldt hier bewust niet: bij uren invullen kun je elke dienst kiezen.
  // rules: afwijkende diensturen van deze medewerker, zodat de browser per dag de juiste uren invult.
  return sortShiftTypes(types).map((t) => ({ id: t.id, code: t.code, label: t.label, hours: shiftHours(t), rules: rules[t.id] }));
}

/** Effectieve uren van een dag: de bevestigde uren, anders de geplande uren (alleen voor dagen tot en met vandaag). */
export function effectiveHours(row: DayRow, todayISO: string) {
  if (row.entry) return row.entry.hours;
  return row.dateISO <= todayISO ? row.planned : 0;
}

/** Eerste en laatste dag (inclusief) van de volledige weken die een maand raken. */
export function weekSpan(year: number, month: number) {
  const days = daysInMonth(year, month);
  const first = startOfWeek(days[0]);
  const last = addDays(startOfWeek(days[days.length - 1]), 6);
  return { first, last, afterLast: addDays(last, 1) };
}

/** Alle dagen van een maand voor één medewerker, met geplande uren, eventuele registratie en de weken. */
export async function loadEmployeeMonth(employeeId: string, year: number, month: number) {
  const days = daysInMonth(year, month);
  const { first, last, afterLast } = weekSpan(year, month);

  const [assignments, entries, sheet, weekSheets, overrides] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { employeeId, date: { gte: first, lt: afterLast } },
      include: { shiftType: true },
    }),
    prisma.timeEntry.findMany({
      where: { employeeId, date: { gte: first, lt: afterLast } },
      include: { editedBy: { select: { name: true, email: true } }, workedShiftType: { select: { code: true, label: true } } },
    }),
    prisma.timesheet.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
      include: { decidedBy: { select: { name: true, email: true } } },
    }),
    prisma.weekSubmission.findMany({
      where: { employeeId, weekStart: { gte: first, lte: last } },
      include: { decidedBy: { select: { name: true, email: true } } },
    }),
    loadHoursOverrides([employeeId]),
  ]);
  const byDate = new Map(assignments.map((a) => [toISODate(a.date), a]));
  const entryByDate = new Map(entries.map((e) => [toISODate(e.date), e]));
  const todayISO = toISODate(todayAmsterdam());

  const monthStartISO = toISODate(days[0]);
  const monthEndISO = toISODate(days[days.length - 1]);
  const buildRow = (day: Date): DayRow => {
    const dateISO = toISODate(day);
    const assignment = byDate.get(dateISO);
    const entry = entryByDate.get(dateISO);
    const plannedInfo = assignment ? employeeShiftHoursInfo(overrides, employeeId, assignment.shiftType, dateISO) : null;
    return {
      dateISO,
      weekStartISO: toISODate(startOfWeek(day)),
      inMonth: dateISO >= monthStartISO && dateISO <= monthEndISO,
      code: assignment?.shiftType.code ?? null,
      label: assignment?.shiftType.label ?? null,
      planned: plannedInfo?.hours ?? 0,
      plannedOverride: plannedInfo?.override ?? false,
      entry: entry
        ? {
            hours: entry.hours,
            note: entry.note,
            editedByName: entry.editedBy ? (entry.editedBy.name ?? entry.editedBy.email) : null,
            workedShiftTypeId: entry.workedShiftTypeId,
            workedCode: entry.workedShiftType?.code ?? null,
            workedLabel: entry.workedShiftType?.label ?? null,
            sickReported: entry.sickReported,
          }
        : null,
    };
  };
  const rows = days.map(buildRow);
  // Alle dagen van de weken die de maand raken, ook die van de buurmaanden; voor de weergave per week.
  const weekRows: DayRow[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) weekRows.push(buildRow(day));

  const sheetByWeek = new Map(weekSheets.map((w) => [toISODate(w.weekStart), w]));
  const weeks: WeekInfo[] = [];
  for (let monday = first; monday <= last; monday = addDays(monday, 7)) {
    const startISO = toISODate(monday);
    const record = sheetByWeek.get(startISO);
    const info: WeekInfo = {
      startISO,
      endISO: toISODate(addDays(monday, 6)),
      weekNo: isoWeek(monday),
      status: record?.status ?? "DRAFT",
      decidedByName: record?.decidedBy ? (record.decidedBy.name ?? record.decidedBy.email) : null,
      decisionNote: record?.decisionNote ?? null,
      planned: 0,
      worked: 0,
      plannedInMonth: 0,
      workedInMonth: 0,
      partial: false,
    };
    for (let i = 0; i < 7; i++) {
      const row = buildRow(addDays(monday, i));
      const inMonth = row.inMonth;
      const worked = effectiveHours(row, todayISO);
      info.planned += row.planned;
      info.worked += worked;
      if (inMonth) {
        info.plannedInMonth += row.planned;
        info.workedInMonth += worked;
      } else {
        info.partial = true;
      }
    }
    weeks.push(info);
  }

  const info: SheetInfo = sheet
    ? {
        status: sheet.status,
        submittedAt: sheet.submittedAt,
        decidedAt: sheet.decidedAt,
        decidedByName: sheet.decidedBy ? (sheet.decidedBy.name ?? sheet.decidedBy.email) : null,
        decisionNote: sheet.decisionNote,
      }
    : EMPTY_SHEET;
  return { rows, weekRows, sheet: info, weeks };
}

/** Maakt voor alle dagen van de periode (tot en met vandaag) zonder registratie een regel met de geplande uren. */
export async function confirmPlannedRange(employeeId: string, from: Date, toInclusive: Date, editedById: string | null) {
  const todayISO = toISODate(todayAmsterdam());
  const afterEnd = addDays(toInclusive, 1);
  const [assignments, entries, overrides] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { employeeId, date: { gte: from, lt: afterEnd } }, include: { shiftType: true } }),
    prisma.timeEntry.findMany({ where: { employeeId, date: { gte: from, lt: afterEnd } }, select: { date: true } }),
    loadHoursOverrides([employeeId]),
  ]);
  const have = new Set(entries.map((e) => toISODate(e.date)));
  const missing = assignments
    .map((a) => ({ date: a.date, iso: toISODate(a.date), planned: employeeShiftHours(overrides, employeeId, a.shiftType, toISODate(a.date)) }))
    .filter((a) => !have.has(a.iso) && a.planned > 0 && a.iso <= todayISO);
  if (missing.length === 0) return 0;
  await prisma.timeEntry.createMany({
    data: missing.map((m) => ({ employeeId, date: m.date, hours: m.planned, plannedHours: m.planned, editedById })),
    skipDuplicates: true,
  });
  return missing.length;
}

/** Idem voor een hele maand. */
export async function confirmPlannedDays(employeeId: string, year: number, month: number, editedById: string | null) {
  const days = daysInMonth(year, month);
  return confirmPlannedRange(employeeId, days[0], days[days.length - 1], editedById);
}

export type OverviewRow = {
  employeeId: string;
  name: string;
  colorGroup: string | null;
  planned: number;
  worked: number;
  status: TimesheetStatus | "NONE";
  unconfirmedDays: number;
  /** Dagen waarop de medewerker aangeeft een andere dienst te hebben gewerkt dan in het rooster. */
  otherShiftDays: number;
  /** Ziek gemeld door de medewerker en nog geen Z in het rooster. */
  sickReportedDays: number;
  /** Goedgekeurde dagen (goedgekeurde weken of maand): gepland en gewerkt, en het aantal dagen. */
  approvedPlanned: number;
  approvedWorked: number;
  approvedDays: number;
  /** Wekelijks indienen: aantal weken (die de maand raken) dat is ingediend, goedgekeurd of teruggestuurd, en het totaal. */
  weeksSubmitted: number;
  weeksApproved: number;
  weeksReturned: number;
  weeksTotal: number;
};

/** Maandoverzicht voor alle medewerkers die in die maand uren hebben of actief zijn. */
export async function loadOverview(year: number, month: number): Promise<OverviewRow[]> {
  const days = daysInMonth(year, month);
  const from = days[0];
  const to = new Date(days[days.length - 1]);
  to.setUTCDate(to.getUTCDate() + 1);
  const todayISO = toISODate(todayAmsterdam());

  const span = weekSpan(year, month);
  const weeksTotal = Math.round((span.afterLast.getTime() - span.first.getTime()) / (7 * 86400000));
  const [employeesRaw, groups, assignments, entries, sheets, weekSheets, overrides] = await Promise.all([
    prisma.employee.findMany({ select: { id: true, name: true, active: true, colorGroup: true, experience: true } }),
    ensureColorGroups(),
    prisma.shiftAssignment.findMany({ where: { date: { gte: from, lt: to } }, include: { shiftType: true } }),
    prisma.timeEntry.findMany({ where: { date: { gte: from, lt: to } } }),
    prisma.timesheet.findMany({ where: { year, month } }),
    prisma.weekSubmission.findMany({ where: { weekStart: { gte: span.first, lte: span.last } } }),
    loadHoursOverrides(),
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
      const hours = employeeShiftHours(overrides, employee.id, a.shiftType, toISODate(a.date));
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
    const myWeeks = weekSheets.filter((w) => w.employeeId === employee.id);
    // Goedgekeurd: de hele maand, of de dagen van goedgekeurde weken.
    const approvedWeekStarts = new Set(myWeeks.filter((w) => w.status === "APPROVED").map((w) => toISODate(w.weekStart)));
    let approvedPlanned = 0;
    let approvedWorked = 0;
    let approvedDays = 0;
    for (const day of days) {
      const iso = toISODate(day);
      const approved = status === "APPROVED" || approvedWeekStarts.has(toISODate(startOfWeek(day)));
      if (!approved) continue;
      const plannedHours = plannedByDate.get(iso) ?? 0;
      const entry = myEntries.get(iso);
      approvedPlanned += plannedHours;
      approvedWorked += entry ? entry.hours : iso <= todayISO ? plannedHours : 0;
      approvedDays += 1;
    }
    // Inactieve medewerkers zonder uren of planning in deze maand laten we weg.
    if (!employee.active && planned === 0 && worked === 0) continue;
    if (planned === 0 && worked === 0 && status === "NONE" && !employee.active) continue;
    rows.push({
      employeeId: employee.id,
      name: employee.name,
      colorGroup: employee.colorGroup,
      planned,
      worked,
      status,
      unconfirmedDays,
      otherShiftDays: [...myEntries.values()].filter((e) => e.workedShiftTypeId).length,
      sickReportedDays: [...myEntries.values()].filter(
        (e) => e.sickReported && mine.find((a) => toISODate(a.date) === toISODate(e.date))?.shiftType.code !== "Z",
      ).length,
      approvedPlanned,
      approvedWorked,
      approvedDays,
      weeksSubmitted: myWeeks.filter((w) => w.status === "SUBMITTED").length,
      weeksApproved: myWeeks.filter((w) => w.status === "APPROVED").length,
      weeksReturned: myWeeks.filter((w) => w.status === "RETURNED").length,
      weeksTotal,
    });
  }
  return rows;
}

/**
 * Slaat de gewerkte uren van één dag op (of verwijdert de registratie als zowel uren als notitie leeg zijn,
 * zodat de dag terugvalt op het voorstel uit het rooster). Gedeeld door medewerker en administratie; de
 * aanroeper controleert de rechten.
 */
export async function writeEntry(
  employeeId: string,
  date: Date,
  hoursInput: string | null,
  note: string,
  editedById: string,
  /** Andere dienst gewerkt dan in het rooster: id, null = zoals gepland, undefined = niet wijzigen. */
  workedShiftTypeIdInput?: string | null,
  /** Ziek gemeld: true/false, undefined = niet wijzigen. Sluit een andere gewerkte dienst uit. */
  sickReportedInput?: boolean,
) {
  const hours = parseHoursInput(hoursInput);
  const cleanNote = note.trim().slice(0, 300) || null;
  const [assignment, existing] = await Promise.all([
    prisma.shiftAssignment.findFirst({ where: { employeeId, date }, include: { shiftType: true } }),
    prisma.timeEntry.findUnique({ where: { employeeId_date: { employeeId, date } }, select: { workedShiftTypeId: true, sickReported: true } }),
  ]);
  let workedShiftTypeId = workedShiftTypeIdInput === undefined ? (existing?.workedShiftTypeId ?? null) : workedShiftTypeIdInput;
  // Dezelfde dienst als in het rooster is geen afwijking.
  if (workedShiftTypeId && workedShiftTypeId === assignment?.shiftTypeId) workedShiftTypeId = null;
  const workedShift = workedShiftTypeId ? await prisma.shiftType.findUnique({ where: { id: workedShiftTypeId } }) : null;
  if (workedShiftTypeId && !workedShift) throw new Error("Onbekende dienst.");
  const sickReported = sickReportedInput === undefined ? (existing?.sickReported ?? false) : sickReportedInput;
  if (sickReported && workedShift) throw new Error("Kies óf ziek geweest óf een andere dienst.");

  if (hours === null && !cleanNote && !workedShift && !sickReported) {
    await prisma.timeEntry.deleteMany({ where: { employeeId, date } });
    return;
  }
  const overrides = await loadHoursOverrides([employeeId]);
  const dateISO = toISODate(date);
  const planned = assignment ? employeeShiftHours(overrides, employeeId, assignment.shiftType, dateISO) : 0;
  // Geen uren ingevuld: de uren van de gewerkte dienst (met afwijking), anders van de geplande dienst.
  // Ziek gemeld zonder uren: niets gewerkt.
  const worked = hours ?? (sickReported ? 0 : workedShift ? employeeShiftHours(overrides, employeeId, workedShift, dateISO) : planned);
  const data = { hours: worked, plannedHours: planned, note: cleanNote, editedById, workedShiftTypeId: workedShift ? workedShift.id : null, sickReported };
  await prisma.timeEntry.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: data,
    create: { employeeId, date, ...data },
  });
}
