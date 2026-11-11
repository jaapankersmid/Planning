/** "08:30" -> 8.5 (uren). Ongeldige of lege tijd geeft null. */
function toHours(time: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  return match ? Number(match[1]) + Number(match[2]) / 60 : null;
}

/**
 * Vaste pauzes die niet als werktijd tellen. Alleen het deel van een pauze dat binnen een
 * tijdsblok van de dienst valt gaat eraf (een dienst van 8:00 tot 10:00 verliest dus niets).
 */
export const BREAKS: [string, string][] = [
  ["10:00", "10:30"],
  ["12:30", "13:00"],
  ["15:00", "15:30"],
];

/**
 * Diensten die vast op een eigen aantal uren staan, zolang de planner bij Diensten niets anders invult.
 * O (8:00–17:00) en CrA (10:30–19:00) tellen als 8 uur.
 */
export const DEFAULT_PAID_HOURS: Record<string, number> = { O: 8, CrA: 8 };

/**
 * Aantal uren van een dienst. Staat er bij de dienst een vast aantal uren (paidHours, of een standaard
 * voor die code), dan geldt dat. Anders: eerste blok plus eventueel het tweede blok, min de pauzes
 * (zie BREAKS). Diensten zonder tijden (V, Z) tellen als 0.
 */
export function shiftHours(shift: {
  code?: string;
  paidHours?: number | null;
  startTime: string | null;
  endTime: string | null;
  secondStartTime: string | null;
  secondEndTime: string | null;
}) {
  if (shift.paidHours !== null && shift.paidHours !== undefined) return shift.paidHours;
  const fixed = shift.code ? DEFAULT_PAID_HOURS[shift.code] : undefined;
  if (fixed !== undefined) return fixed;

  const block = (start: string | null, end: string | null) => {
    const s = toHours(start);
    const e = toHours(end);
    if (s === null || e === null || e <= s) return 0;
    const paused = BREAKS.reduce((sum, [from, to]) => {
      const overlap = Math.min(e, toHours(to)!) - Math.max(s, toHours(from)!);
      return sum + Math.max(0, overlap);
    }, 0);
    return e - s - paused;
  };
  return block(shift.startTime, shift.endTime) + block(shift.secondStartTime, shift.secondEndTime);
}

/** 152.5 -> "152,5"; 160 -> "160"; 0 -> "–". */
export function formatHours(hours: number) {
  if (hours <= 0) return "–";
  const rounded = Math.round(hours * 10) / 10;
  return String(rounded).replace(".", ",");
}
