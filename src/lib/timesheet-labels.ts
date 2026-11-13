import type { TimesheetStatus } from "@prisma/client";

// Bewust zonder server-imports (prisma e.d.): dit bestand wordt ook door client-componenten gebruikt.

export const STATUS_LABEL: Record<TimesheetStatus | "NONE", string> = {
  NONE: "Niet ingediend",
  DRAFT: "Niet ingediend",
  SUBMITTED: "Ingediend",
  APPROVED: "Goedgekeurd",
  RETURNED: "Teruggestuurd",
};

/** Een ingediende of goedgekeurde week/maand kan de medewerker zelf niet meer wijzigen. */
export const isLockedStatus = (status: TimesheetStatus | "NONE" | undefined) => status === "SUBMITTED" || status === "APPROVED";
