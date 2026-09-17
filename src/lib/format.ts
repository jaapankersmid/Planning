const WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const WEEKDAYS_FULL = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];
const MONTHS = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

/** Datums worden overal als "kale" UTC-middernacht bewaard, zodat een dag
 * niet per ongeluk in een andere tijdzone verschuift. */
export function dateFromISO(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function weekdayShort(date: Date) {
  return WEEKDAYS[date.getUTCDay()];
}

export function weekdayFull(date: Date) {
  return WEEKDAYS_FULL[date.getUTCDay()];
}

export function monthName(month: number) {
  return MONTHS[month - 1];
}

export function isWeekend(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Alle dagen van een kalendermaand (1-indexed maand) als UTC-middernacht-datums. */
export function daysInMonth(year: number, month: number) {
  const days: Date[] = [];
  const date = new Date(Date.UTC(year, month - 1, 1));
  while (date.getUTCMonth() === month - 1) {
    days.push(new Date(date));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

export function addMonths(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function formatDayMonth(date: Date) {
  return `${date.getUTCDate()} ${monthName(date.getUTCMonth() + 1)}`;
}

/** Kiest zwarte of witte teksten op een gegeven achtergrondkleur (hex), zodat
 * shiftcode-badges bij elke kleur leesbaar blijven. */
export function readableTextColor(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Relatieve luminantie (WCAG-benadering, snelle versie).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1c2521" : "#ffffff";
}

export const colorGroupSwatch: Record<string, string> = {
  Rood: "#c0524a",
  Oranje: "#c47a33",
  Geel: "#c7a53a",
  Groen: "#4f8f5c",
  Blauw: "#3b6fa8",
  "Licht Blauw": "#4aa3c7",
};
