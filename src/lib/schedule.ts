import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateFromISO, toISODate } from "@/lib/format";
import {
  removeAssignmentFromCalendar,
  syncAssignmentToCalendar,
} from "@/lib/google-calendar";

/** De standaard kleurgroepen, in de volgorde waarin ze in Planning V2.0 stonden. */
export const DEFAULT_COLOR_GROUPS = [
  "Rood",
  "Oranje",
  "Geel",
  "Groen",
  "Blauw",
  "Licht Blauw",
];

/** Vandaag (kalenderdatum in Nederland) als UTC-middernacht, zoals datums in de database. */
export function todayAmsterdam() {
  const iso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date());
  return dateFromISO(iso);
}

/** 1 = maandag ... 7 = zondag. */
export function weekdayNumber(date: Date) {
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay();
}

/** Groepen die standaard niet meetellen in de bezetting (vast personeel en kantoor/overig). */
const GROUPS_EXCLUDED_BY_DEFAULT = ["Rood", "Blauw"];
/** Groepen waarvoor het vaste weekrooster standaard geldt. */
const GROUPS_WITH_TEMPLATE_BY_DEFAULT = ["Rood", "Oranje"];

/**
 * Zorgt dat elke in gebruik zijnde kleurgroep een regel (met volgorde) heeft,
 * en dat elke groep een bezetting-instelling heeft (standaard: Rood en Blauw
 * tellen niet mee, de rest wel).
 */
export async function ensureColorGroups() {
  const [groups, used] = await Promise.all([
    prisma.colorGroup.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.employee.findMany({
      where: { colorGroup: { not: null } },
      distinct: ["colorGroup"],
      select: { colorGroup: true },
    }),
  ]);

  const known = new Set(groups.map((g) => g.name));
  const wanted = [
    ...DEFAULT_COLOR_GROUPS,
    ...used.map((u) => u.colorGroup as string),
  ].filter((name, i, all) => all.indexOf(name) === i && !known.has(name));

  if (wanted.length > 0) {
    let next = groups.reduce((max, g) => Math.max(max, g.sortOrder), -1) + 1;
    await prisma.colorGroup.createMany({
      data: wanted.map((name) => ({ name, sortOrder: next++ })),
      skipDuplicates: true,
    });
  }

  // Nog niet ingestelde groepen krijgen de standaardwaarde; een keuze van de gebruiker blijft staan.
  if (
    wanted.length > 0 ||
    groups.some((g) => g.countsInCoverage === null || g.usesTemplate === null)
  ) {
    await prisma.colorGroup.updateMany({
      where: { usesTemplate: null, name: { in: GROUPS_WITH_TEMPLATE_BY_DEFAULT } },
      data: { usesTemplate: true },
    });
    await prisma.colorGroup.updateMany({
      where: { usesTemplate: null },
      data: { usesTemplate: false },
    });
    await prisma.colorGroup.updateMany({
      where: { countsInCoverage: null, name: { in: GROUPS_EXCLUDED_BY_DEFAULT } },
      data: { countsInCoverage: false },
    });
    await prisma.colorGroup.updateMany({
      where: { countsInCoverage: null },
      data: { countsInCoverage: true },
    });
  }

  return prisma.colorGroup.findMany({ orderBy: { sortOrder: "asc" } });
}

/** Sorteert medewerkers zoals in het Excel-rooster: kleurgroep (eigen volgorde), dan ervaring (hoog eerst), dan naam. */
export function sortEmployees<
  T extends { name: string; colorGroup: string | null; experience: number | null },
>(employees: T[], groups: { name: string; sortOrder: number }[]) {
  const order = new Map(groups.map((g) => [g.name, g.sortOrder]));
  const rank = (e: T) =>
    e.colorGroup && order.has(e.colorGroup) ? order.get(e.colorGroup)! : 9999;
  return [...employees].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.experience ?? 0) - (a.experience ?? 0) ||
      a.name.localeCompare(b.name, "nl"),
  );
}

/**
 * Past het vaste weekrooster toe op [fromISO, toISO). Regels:
 * - alleen dagen vanaf vandaag: verleden datums worden nooit aangeraakt;
 * - dagen die handmatig zijn ingesteld (source MANUAL, of een DayOverride) blijven staan;
 * - eerder automatisch aangemaakte diensten (TEMPLATE) volgen een gewijzigd vast rooster mee.
 * Idempotent, dus veilig om vaak aan te roepen.
 */
export async function reconcileTemplate(fromISO: string, toISO: string) {
  const today = todayAmsterdam();
  let from = dateFromISO(fromISO);
  const to = dateFromISO(toISO);
  if (from < today) from = today;
  if (from >= to) return;

  const groups = await ensureColorGroups();
  const [entries, overrides, assignments, employees] = await Promise.all([
    prisma.weeklyScheduleEntry.findMany(),
    prisma.dayOverride.findMany({ where: { date: { gte: from, lt: to } } }),
    prisma.shiftAssignment.findMany({ where: { date: { gte: from, lt: to } } }),
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        colorGroup: true,
        user: { select: { id: true, calendarSyncEnabled: true } },
      },
    }),
  ]);

  // Het vaste rooster geldt alleen voor medewerkers in een kleurgroep waarvoor dat is aangezet
  // (medewerkers zonder groep doen mee). Voor de rest wordt niets aangemaakt, en automatisch
  // aangemaakte diensten verdwijnen weer als de groep wordt uitgezet.
  const offGroups = new Set(groups.filter((g) => g.usesTemplate === false).map((g) => g.name));
  const templateOff = new Set(
    employees.filter((e) => e.colorGroup && offGroups.has(e.colorGroup)).map((e) => e.id),
  );

  const template = new Map(
    entries.map((e) => [`${e.employeeId}_${e.weekday}`, e.shiftTypeId]),
  );
  const overridden = new Set(
    overrides.map((o) => `${o.employeeId}_${toISODate(o.date)}`),
  );
  const existing = new Map(
    assignments.map((a) => [`${a.employeeId}_${toISODate(a.date)}`, a]),
  );
  const activeIds = new Set(employees.map((e) => e.id));
  const syncUsers = new Map(
    employees.filter((e) => e.user?.calendarSyncEnabled).map((e) => [e.id, e.user!.id]),
  );

  const toCreate: { employeeId: string; date: Date; shiftTypeId: string }[] = [];
  const toUpdate: { id: string; employeeId: string; shiftTypeId: string }[] = [];
  const toDelete: {
    id: string;
    employeeId: string;
    googleEventId: string | null;
    googleEventId2: string | null;
  }[] = [];

  for (const date = new Date(from); date < to; date.setUTCDate(date.getUTCDate() + 1)) {
    const iso = toISODate(date);
    const weekday = weekdayNumber(date);
    for (const employeeId of activeIds) {
      const key = `${employeeId}_${iso}`;
      if (overridden.has(key)) continue;
      const wanted = templateOff.has(employeeId)
        ? null
        : (template.get(`${employeeId}_${weekday}`) ?? null);
      const current = existing.get(key);

      if (current) {
        if (current.source !== "TEMPLATE") continue;
        if (!wanted) {
          toDelete.push({
            id: current.id,
            employeeId,
            googleEventId: current.googleEventId,
            googleEventId2: current.googleEventId2,
          });
        } else if (current.shiftTypeId !== wanted) {
          toUpdate.push({ id: current.id, employeeId, shiftTypeId: wanted });
        }
      } else if (wanted) {
        toCreate.push({ employeeId, date: new Date(date), shiftTypeId: wanted });
      }
    }
  }

  if (toDelete.length) {
    await prisma.shiftAssignment.deleteMany({
      where: { id: { in: toDelete.map((d) => d.id) } },
    });
  }
  for (const u of toUpdate) {
    await prisma.shiftAssignment.update({
      where: { id: u.id },
      data: { shiftTypeId: u.shiftTypeId },
    });
  }
  const created = toCreate.length
    ? await prisma.shiftAssignment.createManyAndReturn({
        data: toCreate.map((c) => ({ ...c, source: "TEMPLATE" as const })),
        skipDuplicates: true,
        select: { id: true, employeeId: true },
      })
    : [];

  // Agenda-sync gebeurt na het antwoord, alleen voor mensen die de koppeling aan hebben.
  const syncIds = [...created, ...toUpdate]
    .filter((a) => syncUsers.has(a.employeeId))
    .map((a) => a.id);
  const removals = toDelete.filter((d) => (d.googleEventId || d.googleEventId2) && syncUsers.has(d.employeeId));
  if (syncIds.length || removals.length) {
    after(async () => {
      for (const id of syncIds) {
        await syncAssignmentToCalendar(id).catch((e) =>
          console.error("Kalender-sync mislukt:", e),
        );
      }
      for (const r of removals) {
        await removeAssignmentFromCalendar(
          r.id,
          r.googleEventId,
          syncUsers.get(r.employeeId) ?? null,
          r.googleEventId2,
        ).catch((e) => console.error("Kalender-verwijdering mislukt:", e));
      }
    });
  }
}

/** Past het vaste rooster toe op een hele kalendermaand. */
export async function reconcileMonth(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  await reconcileTemplate(toISODate(start), toISODate(end));
}

/**
 * Dezelfde telling als de "Telling uitlaten"-rijen in Planning V2.0: wie telt
 * mee in de ochtend (8:00-12:30) resp. middag (15:30-19:30)?
 */
const DEFAULT_MORNING = ["X", "XI", "O", "Uit", "UitO"];
const DEFAULT_AFTERNOON = ["X", "IX", "O", "A", "Uit", "UitA"];

/**
 * Zet de bezetting-vinkjes op de standaardwaarden uit Planning V2.0, maar
 * alleen zolang er nog nergens een vinkje staat. Daarna beheer je ze zelf bij
 * "Diensten".
 */
export async function ensureCoverageDefaults() {
  const configured = await prisma.shiftType.count({
    where: { OR: [{ countsMorning: true }, { countsAfternoon: true }] },
  });
  if (configured > 0) return;
  await prisma.shiftType.updateMany({
    where: { code: { in: DEFAULT_MORNING } },
    data: { countsMorning: true },
  });
  await prisma.shiftType.updateMany({
    where: { code: { in: DEFAULT_AFTERNOON } },
    data: { countsAfternoon: true },
  });
}
