import type { Role } from "@prisma/client";

/** Planner: volledige beheerrechten (rooster, verlof, gebruikers en rechten). Technisch de rol ADMIN. */
export const isPlanner = (role: Role | undefined | null) => role === "ADMIN";

/** Administratie: ziet het rooster (alleen lezen) en beheert de urenregistratie. */
export const isAccounting = (role: Role | undefined | null) => role === "ACCOUNTING";

/** Mag de uren van iedereen inzien, goedkeuren, corrigeren en exporteren. */
export const canManageHours = (role: Role | undefined | null) => isPlanner(role) || isAccounting(role);

/**
 * Mag de klantendatabase en de crematiedossiers inzien en bewerken. Nu voor alle
 * rollen (de crematoriummedewerkers werken er dagelijks in); wil je dit later
 * beperken, pas dan alleen deze functie aan.
 */
export const canManageCustomers = (role: Role | undefined | null) => !!role;

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Planner",
  ACCOUNTING: "Administratie",
  EMPLOYEE: "Medewerker",
};

export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: "ADMIN", label: ROLE_LABEL.ADMIN, description: "Rooster, verlof, vakanties, diensten, gebruikers en rechten beheren; ook de uren inzien en goedkeuren." },
  { value: "ACCOUNTING", label: ROLE_LABEL.ACCOUNTING, description: "Rooster inzien (alleen lezen) en de urenregistratie van iedereen beheren, goedkeuren en exporteren." },
  { value: "EMPLOYEE", label: ROLE_LABEL.EMPLOYEE, description: "Eigen rooster, verlof, beschikbaarheid en eigen uren." },
];
