import type { HolidayPeriod } from "@prisma/client";
import { toISODate } from "@/lib/format";

export type HolidayLite = Pick<
  HolidayPeriod,
  "id" | "name" | "startDate" | "endDate" | "wantMorning" | "wantAfternoon"
>;

/** De vakantieperiode die op deze dag valt. Bij overlap wint de periode die het laatst begint. */
export function holidayOn(periods: HolidayLite[], iso: string) {
  let found: HolidayLite | null = null;
  for (const p of periods) {
    if (toISODate(p.startDate) <= iso && iso <= toISODate(p.endDate)) {
      if (!found || p.startDate >= found.startDate) found = p;
    }
  }
  return found;
}

/** Groepeert opeenvolgende dagen met dezelfde vakantie, voor een banner met colspan. */
export function holidaySegments(days: Date[], periods: HolidayLite[]) {
  const segments: { holiday: HolidayLite | null; span: number }[] = [];
  for (const day of days) {
    const holiday = holidayOn(periods, toISODate(day));
    const last = segments[segments.length - 1];
    if (last && last.holiday?.id === holiday?.id) last.span += 1;
    else segments.push({ holiday, span: 1 });
  }
  return segments;
}
