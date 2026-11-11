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

/** Aantal uren van een dienst: eerste blok plus eventueel het tweede blok. Pauzes (zie BREAKS) gaan eraf. Diensten zonder tijden (V, Z) tellen als 0. */
export function shiftHours(shift: {
  startTime: string | null;
  endTime: string | null;
  secondStartTime: string | null;
  secondEndTime: string | null;
}) {
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
