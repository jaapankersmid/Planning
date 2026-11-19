import { prisma } from "@/lib/prisma";
import { addDays, dateFromISO, startOfWeek, toISODate } from "@/lib/format";
import { contractOn, loadContractRules, sickDayHours } from "@/lib/contract-hours";
import { weekdayNumber } from "@/lib/schedule";
import { employeeShiftHours, loadHoursOverrides } from "@/lib/shift-hours-overrides";

/*
 * Ziekte uit het rooster: een dag telt als ziek als de planner er Z (Ziek) heeft gezet. Er wordt niets apart
 * geregistreerd en er staat geen reden of diagnose bij. De uren van een ziektedag volgen het contract van die week
 * (contractperiodes), verdeeld naar het vaste rooster, zoals bij het verlofsaldo (sickDayHours). Zonder contract: de
 * uren van het vaste rooster op die weekdag; zonder vaste dienst 0 uur.
 *
 * Alleen voor planners en administratie (canManageHours): de totalen komen nergens anders in de app, de mails of
 * de agenda. Dat iemand ziek is, blijft in het rooster gewoon zichtbaar.
 */

export const SICK_CODE = "Z";
/** Diensten waarop iemand niet werkt: die onderbreken een ziekteperiode niet (bv. het weekend vrij). */
const FREE_CODES = new Set(["V"]);
/** Hoeveel vrije dagen een periode hooguit mag overbruggen (een weekend, een paar vrije dagen). */
const MAX_BRIDGE_DAYS = 4;

export type SickDay = { iso: string; hours: number };
export type SickPeriod = {
  startISO: string;
  endISO: string;
  /** Aantal Z-dagen in de periode (de vrije dagen ertussen tellen niet). */
  days: number;
  hours: number;
  /** De medewerker is nog ziek: de periode loopt tot en met vandaag (eventueel via vrije dagen). */
  ongoing: boolean;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Voegt ziektedagen samen tot periodes. Twee Z-dagen horen bij dezelfde periode als alle dagen ertussen vrij zijn
 * (geen dienst of V), met hooguit 4 vrije dagen ertussen. `isFree(iso)` zegt of een dag vrij is.
 */
export function sickPeriods(days: SickDay[], isFree: (iso: string) => boolean, todayISO: string): SickPeriod[] {
  const sorted = [...days].sort((a, b) => a.iso.localeCompare(b.iso));
  const periods: SickPeriod[] = [];
  let cur: SickPeriod | null = null;
  const bridged = (fromISO: string, toISO: string) => {
    // Alle dagen strikt tussen fromISO en toISO vrij, en niet te veel?
    let gap = 0;
    for (let d = addDays(dateFromISO(fromISO), 1); toISODate(d) < toISO; d = addDays(d, 1)) {
      if (!isFree(toISODate(d)) || ++gap > MAX_BRIDGE_DAYS) return false;
    }
    return true;
  };
  for (const day of sorted) {
    if (cur && bridged(cur.endISO, day.iso)) {
      cur.endISO = day.iso;
      cur.days += 1;
      cur.hours += day.hours;
    } else {
      if (cur) periods.push(cur);
      cur = { startISO: day.iso, endISO: day.iso, days: 1, hours: day.hours, ongoing: false };
    }
  }
  if (cur) periods.push(cur);
  for (const p of periods) {
    p.hours = round(p.hours);
    p.ongoing = p.startISO <= todayISO && (p.endISO >= todayISO || bridged(p.endISO, addDaysISO(todayISO, 1)));
  }
  return periods;
}

const addDaysISO = (iso: string, n: number) => toISODate(addDays(dateFromISO(iso), n));

/** Telt de Z-dagen en -uren binnen [fromISO, toISO]. */
export function countInRange(days: SickDay[], fromISO: string, toISO: string) {
  let n = 0;
  let hours = 0;
  for (const d of days) {
    if (d.iso < fromISO || d.iso > toISO) continue;
    n += 1;
    hours += d.hours;
  }
  return { days: n, hours: round(hours) };
}

export type SickOverview = {
  employeeId: string;
  days: SickDay[];
  periods: SickPeriod[];
  /** Ziek in de gekozen periode. */
  inRange: { days: number; hours: number };
  /** Ziek in het lopende kalenderjaar. */
  thisYear: { days: number; hours: number };
  ongoing: boolean;
};

/**
 * Laadt de ziektedagen van de medewerkers. Er wordt een ruimere periode gelezen dan gevraagd (een jaar ervoor en
 * tot na vandaag), zodat een periode die over de grens loopt met de juiste begin- en einddatum wordt getoond.
 */
export async function loadSickness(employeeIds: string[], fromISO: string, toISO: string, todayISO: string) {
  const yearStartISO = `${todayISO.slice(0, 4)}-01-01`;
  const startISO = [fromISO, yearStartISO].sort()[0];
  const endISO = [toISO, todayISO].sort()[1];
  const windowStart = addDays(dateFromISO(startISO), -366);
  const windowEnd = addDays(dateFromISO(endISO), 60);

  const [assignments, templates, overrides, contractRules, employees] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: windowStart, lt: windowEnd } },
      select: { employeeId: true, date: true, shiftType: { select: { code: true } } },
    }),
    prisma.weeklyScheduleEntry.findMany({ where: { employeeId: { in: employeeIds } }, include: { shiftType: true } }),
    loadHoursOverrides(employeeIds),
    loadContractRules(employeeIds),
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, weeklyHours: true } }),
  ]);
  const weeklyHours = new Map(employees.map((e) => [e.id, e.weeklyHours]));
  /** Uren van een ziektedag: het contract van die week, verdeeld naar het vaste rooster. */
  const sickHoursOn = (employeeId: string, day: Date) => {
    const monday = startOfWeek(day);
    const templateWeek = Array.from({ length: 7 }, (_, i) => templateHoursOn(employeeId, addDays(monday, i)));
    const contract = contractOn(contractRules.get(employeeId), toISODate(monday), weeklyHours.get(employeeId) ?? null);
    return sickDayHours(templateWeek, (day.getUTCDay() + 6) % 7, contract);
  };
  // Vast rooster per weekdag; de uren hangen van de dag af (afwijkende diensturen met een ingangsdatum).
  const templateShift = new Map<string, (typeof templates)[number]["shiftType"]>();
  for (const t of templates) templateShift.set(`${t.employeeId}_${t.weekday}`, t.shiftType);
  const templateHoursOn = (employeeId: string, day: Date) => {
    const shift = templateShift.get(`${employeeId}_${weekdayNumber(day)}`);
    if (!shift || FREE_CODES.has(shift.code) || shift.code === SICK_CODE) return 0;
    return employeeShiftHours(overrides, employeeId, shift, toISODate(day));
  };

  const codeBy = new Map<string, string>();
  const sickBy = new Map<string, SickDay[]>();
  for (const a of assignments) {
    const iso = toISODate(a.date);
    codeBy.set(`${a.employeeId}_${iso}`, a.shiftType.code);
    if (a.shiftType.code !== SICK_CODE) continue;
    const list = sickBy.get(a.employeeId) ?? [];
    list.push({ iso, hours: sickHoursOn(a.employeeId, a.date) });
    sickBy.set(a.employeeId, list);
  }

  const result = new Map<string, SickOverview>();
  for (const id of employeeIds) {
    const days = sickBy.get(id) ?? [];
    const isFree = (iso: string) => {
      const code = codeBy.get(`${id}_${iso}`);
      return code === undefined || FREE_CODES.has(code);
    };
    const all = sickPeriods(days, isFree, todayISO);
    const periods = all.filter((p) => p.endISO >= fromISO && p.startISO <= toISO);
    result.set(id, {
      employeeId: id,
      days,
      periods,
      inRange: countInRange(days, fromISO, toISO),
      thisYear: countInRange(days, yearStartISO, `${todayISO.slice(0, 4)}-12-31`),
      ongoing: all.some((p) => p.ongoing),
    });
  }
  return result;
}
