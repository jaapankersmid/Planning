/** "08:30" -> 8.5 (uren). Ongeldige of lege tijd geeft null. */
function toHours(time: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  return match ? Number(match[1]) + Number(match[2]) / 60 : null;
}

/** Aantal uren van een dienst: eerste blok plus eventueel het tweede blok. Diensten zonder tijden (V, Z) tellen als 0. */
export function shiftHours(shift: {
  startTime: string | null;
  endTime: string | null;
  secondStartTime: string | null;
  secondEndTime: string | null;
}) {
  const block = (start: string | null, end: string | null) => {
    const s = toHours(start);
    const e = toHours(end);
    return s !== null && e !== null && e > s ? e - s : 0;
  };
  return block(shift.startTime, shift.endTime) + block(shift.secondStartTime, shift.secondEndTime);
}

/** 152.5 -> "152,5"; 160 -> "160"; 0 -> "–". */
export function formatHours(hours: number) {
  if (hours <= 0) return "–";
  const rounded = Math.round(hours * 10) / 10;
  return String(rounded).replace(".", ",");
}
