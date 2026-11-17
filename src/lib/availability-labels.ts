export type AvailabilityValue = "AVAILABLE" | "MORNING" | "AFTERNOON" | "UNAVAILABLE";

export const AVAILABILITY_CHOICES: AvailabilityValue[] = ["AVAILABLE", "MORNING", "AFTERNOON", "UNAVAILABLE"];

/** Teksten en kleuren voor beschikbaarheid (Mijn rooster). */
export const AVAILABILITY_LABEL: Record<AvailabilityValue, { short: string; long: string; className: string }> = {
  AVAILABLE: { short: "Hele dag", long: "Beschikbaar (hele dag)", className: "bg-good text-good-text" },
  MORNING: { short: "Ochtend", long: "Alleen ochtend (8:00–12:30)", className: "bg-sky-200 text-sky-950 dark:bg-sky-900 dark:text-sky-100" },
  AFTERNOON: { short: "Middag", long: "Alleen middag (15:30–19:30)", className: "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100" },
  UNAVAILABLE: { short: "Niet", long: "Niet beschikbaar", className: "bg-bad text-bad-text" },
};
