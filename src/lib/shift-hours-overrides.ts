import { prisma } from "@/lib/prisma";
import { shiftHours } from "@/lib/hours";
import { toISODate } from "@/lib/format";
import type { OverrideRule } from "@/lib/shift-hours-rules";

export { hoursFromRules, type OverrideRule } from "@/lib/shift-hours-rules";

/**
 * Afwijkende diensturen per medewerker (tabel ShiftHoursOverride). Een regel zegt: dienst S telt voor
 * medewerker M vanaf datum D als H uur (H = null: vanaf D weer de gewone uren). De laatste regel met
 * D <= de dag geldt. Alleen voor uren en verlof; tijden en bezetting in het rooster blijven gelijk.
 *
 * Gebruik overal waar de uren van een dienst voor een medewerker op een dag nodig zijn
 * `employeeShiftHours(overrides, employeeId, shiftType, dateISO)` in plaats van `shiftHours(shiftType)`.
 */

/** employeeId -> shiftTypeId -> regels, oplopend op ingangsdatum. */
export type HoursOverrides = Map<string, Map<string, OverrideRule[]>>;

export const NO_OVERRIDES: HoursOverrides = new Map();

type ShiftForHours = Parameters<typeof shiftHours>[0] & { id: string };

/** Bouwt de opzoekstructuur uit losse regels (ook gebruikt voor de voorvertoning met een extra regel). */
export function buildOverrides(rows: { employeeId: string; shiftTypeId: string; validFromISO: string; hours: number | null }[]): HoursOverrides {
  const map: HoursOverrides = new Map();
  for (const r of rows) {
    const byShift = map.get(r.employeeId) ?? new Map<string, OverrideRule[]>();
    const list = byShift.get(r.shiftTypeId) ?? [];
    // Zelfde dienst en ingangsdatum: de laatste wint.
    const same = list.findIndex((x) => x.fromISO === r.validFromISO);
    if (same >= 0) list.splice(same, 1);
    list.push({ fromISO: r.validFromISO, hours: r.hours });
    list.sort((a, b) => a.fromISO.localeCompare(b.fromISO));
    byShift.set(r.shiftTypeId, list);
    map.set(r.employeeId, byShift);
  }
  return map;
}

export async function loadOverrideRows(employeeIds?: string[]) {
  const rows = await prisma.shiftHoursOverride.findMany({
    where: employeeIds ? { employeeId: { in: employeeIds } } : {},
    select: { employeeId: true, shiftTypeId: true, validFrom: true, hours: true },
  });
  return rows.map((r) => ({ employeeId: r.employeeId, shiftTypeId: r.shiftTypeId, validFromISO: toISODate(r.validFrom), hours: r.hours }));
}

/** Alle afwijkingen voor deze medewerkers (of iedereen). */
export async function loadHoursOverrides(employeeIds?: string[]): Promise<HoursOverrides> {
  return buildOverrides(await loadOverrideRows(employeeIds));
}

/** De regel die op deze dag geldt, of null (dan de gewone uren). */
export function overrideOn(overrides: HoursOverrides, employeeId: string, shiftTypeId: string, dateISO: string): number | null {
  const list = overrides.get(employeeId)?.get(shiftTypeId);
  if (!list) return null;
  let hours: number | null = null;
  for (const rule of list) {
    if (rule.fromISO > dateISO) break;
    hours = rule.hours;
  }
  return hours;
}

/** Uren van een dienst voor deze medewerker op deze dag, met of er een afwijking geldt. */
export function employeeShiftHoursInfo(overrides: HoursOverrides, employeeId: string, shift: ShiftForHours, dateISO: string) {
  const custom = overrideOn(overrides, employeeId, shift.id, dateISO);
  return custom === null ? { hours: shiftHours(shift), override: false } : { hours: custom, override: true };
}

export function employeeShiftHours(overrides: HoursOverrides, employeeId: string, shift: ShiftForHours, dateISO: string) {
  return employeeShiftHoursInfo(overrides, employeeId, shift, dateISO).hours;
}

/** Regels per dienst voor één medewerker, om in de browser per dag te kunnen opzoeken (bv. "andere dienst gewerkt"). */
export function rulesFor(overrides: HoursOverrides, employeeId: string): Record<string, OverrideRule[]> {
  return Object.fromEntries(overrides.get(employeeId) ?? []);
}
