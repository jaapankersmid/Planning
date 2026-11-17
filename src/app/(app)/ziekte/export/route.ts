import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toISODate } from "@/lib/format";
import { csvCell, csvNum, csvResponse } from "@/lib/csv";
import { parsePeriod } from "@/lib/leave-balance";
import { canManageHours } from "@/lib/roles";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";
import { loadSickness } from "@/lib/sickness";

/**
 * Csv van het ziekteoverzicht (?van=&tot=, standaard dit jaar); ?soort=periodes geeft een regel per ziekteperiode.
 * Alleen voor planners en administratie. Alleen data, dagen en uren: geen reden of diagnose.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) return new Response("Geen toegang.", { status: 403 });

  const url = new URL(request.url);
  const todayISO = toISODate(todayAmsterdam());
  const { fromISO, toISO } = parsePeriod({ van: url.searchParams.get("van"), tot: url.searchParams.get("tot") }, todayISO);
  const perPeriod = url.searchParams.get("soort") === "periodes";

  const [employeesRaw, groups] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, colorGroup: true, experience: true, weeklyHours: true } }),
    ensureColorGroups(),
  ]);
  const employees = sortEmployees(employeesRaw, groups);
  const sickness = await loadSickness(employees.map((e) => e.id), fromISO, toISO, todayISO);
  const year = todayISO.slice(0, 4);

  const rows: string[][] = [];
  if (perPeriod) {
    rows.push(["Medewerker", "Van", "Tot en met", "Ziektedagen", "Uren", "Nog ziek"].map(csvCell));
    for (const e of employees) {
      for (const p of sickness.get(e.id)!.periods) {
        rows.push([csvCell(e.name), p.startISO, p.endISO, String(p.days), csvNum(p.hours), csvCell(p.ongoing ? "ja" : "nee")]);
      }
    }
  } else {
    rows.push(
      ["Medewerker", "Kleurgroep", "Uren per week", "Ziektedagen in periode", "Ziekte-uren in periode", `Ziektedagen ${year}`, `Ziekte-uren ${year}`, "Nu ziek"].map(csvCell),
    );
    for (const e of employees) {
      const s = sickness.get(e.id)!;
      rows.push([
        csvCell(e.name),
        csvCell(e.colorGroup ?? ""),
        e.weeklyHours ? csvNum(e.weeklyHours) : "",
        String(s.inRange.days),
        csvNum(s.inRange.hours),
        String(s.thisYear.days),
        csvNum(s.thisYear.hours),
        csvCell(s.ongoing ? "ja" : "nee"),
      ]);
    }
  }
  return csvResponse(rows, `ziekte-${perPeriod ? "periodes" : "totalen"}-${fromISO}-tm-${toISO}.csv`);
}
