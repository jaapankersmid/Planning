import { prisma } from "@/lib/prisma";
import { addDays, startOfWeek, toISODate } from "@/lib/format";
import { weekdayNumber } from "@/lib/schedule";
import { contractOn, loadContractRules, sickDayHours } from "@/lib/contract-hours";
import { employeeShiftHours, loadHoursOverrides, type HoursOverrides } from "@/lib/shift-hours-overrides";

/**
 * Ziekte-uren voor de urenregistratie (Mijn uren, Uren, export): een ziektedag (Z in het rooster of "ziek gemeld")
 * telt als gewerkt voor het contract van die week, verdeeld naar het vaste rooster (sickDayHours), net als bij het
 * verlof. Zonder contract (of 0 uur) zijn de ziekte-uren 0. Wordt berekend bij het tonen, niet opgeslagen.
 */
export async function loadSickHours(employeeIds: string[], overridesIn?: HoursOverrides) {
  const [templates, overrides, rules, employees] = await Promise.all([
    prisma.weeklyScheduleEntry.findMany({ where: { employeeId: { in: employeeIds } }, include: { shiftType: true } }),
    overridesIn ?? loadHoursOverrides(employeeIds),
    loadContractRules(employeeIds),
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, weeklyHours: true } }),
  ]);
  const weeklyHours = new Map(employees.map((e) => [e.id, e.weeklyHours]));
  const templateShift = new Map<string, (typeof templates)[number]["shiftType"]>();
  for (const t of templates) templateShift.set(`${t.employeeId}_${t.weekday}`, t.shiftType);
  const templateHoursOn = (employeeId: string, day: Date) => {
    const shift = templateShift.get(`${employeeId}_${weekdayNumber(day)}`);
    if (!shift || shift.code === "V" || shift.code === "Z") return 0;
    return employeeShiftHours(overrides, employeeId, shift, toISODate(day));
  };
  /** Ziekte-uren van deze dag voor deze medewerker (0 zonder contract). */
  return (employeeId: string, day: Date) => {
    const monday = startOfWeek(day);
    const contract = contractOn(rules.get(employeeId), toISODate(monday), weeklyHours.get(employeeId) ?? null);
    if (contract === null || contract <= 0) return 0;
    const templateWeek = Array.from({ length: 7 }, (_, i) => templateHoursOn(employeeId, addDays(monday, i)));
    return sickDayHours(templateWeek, (day.getUTCDay() + 6) % 7, contract);
  };
}
