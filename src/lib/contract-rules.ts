/**
 * Contracturen per week met een ingangsdatum (zonder database, ook bruikbaar in de browser).
 *
 * - Een regel geldt vanaf een maandag; een week heeft dus nooit twee contracten.
 * - Het contract van een week is de regel met de laatste ingangsdatum op of voor de maandag van die week.
 * - Zonder regel (of voor de eerste regel) geldt het vaste getal Employee.weeklyHours.
 * - BEGIN_ISO is "vanaf het begin": zo worden de bestaande uren bewaard als er voor het eerst een datum komt.
 */

export const BEGIN_ISO = "2000-01-03";

export type ContractRule = { fromISO: string; hours: number };

const round = (n: number) => Math.round(n * 100) / 100;

/** De maandag van de week waarin deze datum valt (ISO). */
export function mondayOfISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Contract van de week die op deze maandag begint. Regels oplopend op datum. */
export function contractOn(rules: ContractRule[] | undefined, mondayISO: string, fallback: number | null): number | null {
  // Zonder periodes: het vaste getal voor alle weken (zoals voorheen).
  if (!rules || rules.length === 0) return fallback;
  // Met periodes: voor de eerste periode is er geen contract bekend (bij de eerste periode wordt het oude getal
  // als "vanaf het begin" bewaard, dus dat komt alleen voor als er toen geen getal was).
  let hours: number | null = null;
  for (const rule of rules) {
    if (rule.fromISO > mondayISO) break;
    hours = rule.hours;
  }
  return hours;
}

/** Het contract dat nu geldt en sinds wanneer (null = vanaf het begin of zonder datum). */
export function currentContract(rules: ContractRule[] | undefined, todayISO: string, fallback: number | null) {
  const monday = mondayOfISO(todayISO);
  let current: ContractRule | null = null;
  for (const rule of rules ?? []) {
    if (rule.fromISO > monday) break;
    current = rule;
  }
  if (!current) return { hours: rules && rules.length > 0 ? null : fallback, sinceISO: null as string | null };
  return { hours: current.hours, sinceISO: current.fromISO === BEGIN_ISO ? null : current.fromISO };
}

/**
 * Uren van een ziektedag, zodat ziekte nooit verlof kost en een week ziek precies het contract van die week is.
 * templateWeek: de uren van het vaste rooster per weekdag (maandag = 0 ... zondag = 6), met afwijkende diensturen.
 * - Zonder contract: de uren van het vaste rooster op die dag (zoals voorheen).
 * - Met contract: de dag van het vaste rooster, naar verhouding geschaald zodat het hele vaste rooster = het contract.
 *   Is de dag geen dag van het vaste rooster (of is er geen vast rooster), dan het contract gelijk verdeeld over de
 *   dagen van het vaste rooster (of over 5 dagen als er geen vast rooster is).
 */
export function sickDayHours(templateWeek: number[], dayIndex: number, contract: number | null): number {
  const own = templateWeek[dayIndex] ?? 0;
  if (contract === null || contract <= 0) return own;
  const sum = templateWeek.reduce((s, h) => s + h, 0);
  const days = templateWeek.filter((h) => h > 0).length;
  if (sum > 0 && own > 0) return round((own * contract) / sum);
  return round(contract / (days || 5));
}
