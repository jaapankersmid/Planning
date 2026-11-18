/** Eén regel voor afwijkende diensturen: vanaf fromISO telt de dienst als `hours` uur (null = weer de gewone uren). */
export type OverrideRule = { fromISO: string; hours: number | null };

/**
 * De uren die op deze dag gelden volgens de regels (oplopend op ingangsdatum), anders `standard`.
 * Zonder databasecode, zodat ook de browser het kan gebruiken.
 */
export function hoursFromRules(rules: OverrideRule[] | undefined, dateISO: string, standard: number) {
  let hours: number | null = null;
  for (const rule of rules ?? []) {
    if (rule.fromISO > dateISO) break;
    hours = rule.hours;
  }
  return hours ?? standard;
}
