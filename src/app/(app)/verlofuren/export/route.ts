import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toISODate } from "@/lib/format";
import { csvCell, csvNum, csvResponse } from "@/lib/csv";
import { loadBalances, parsePeriod, periodLeave } from "@/lib/leave-balance";
import { canManageHours } from "@/lib/roles";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";

/**
 * Csv van de verlofuren van alle actieve medewerkers in een periode (?van=&tot=, standaard dit jaar).
 * ?soort=weken geeft een regel per week. Alleen voor planners en administratie.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) return new Response("Geen toegang.", { status: 403 });

  const url = new URL(request.url);
  const todayISO = toISODate(todayAmsterdam());
  const { fromISO, toISO } = parsePeriod({ van: url.searchParams.get("van"), tot: url.searchParams.get("tot") }, todayISO);
  const perWeek = url.searchParams.get("soort") === "weken";

  const [employeesRaw, groups] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, colorGroup: true, experience: true } }),
    ensureColorGroups(),
  ]);
  const employees = sortEmployees(employeesRaw, groups);
  const balances = await loadBalances(todayISO, employees.map((e) => e.id));

  const rows: string[][] = [];
  if (perWeek) {
    rows.push(["Medewerker", "Week", "Maandag", "Verlof (uur)", "Soort", "Toelichting", "Uren per week"].map(csvCell));
    for (const e of employees) {
      const b = balances.get(e.id)!;
      for (const w of periodLeave(b, fromISO, toISO).weeks) {
        const kind = w.ignored ? "voor peildatum (telt niet mee)" : w.planned ? "ingepland" : "opgenomen";
        rows.push([csvCell(e.name), csvCell(w.label ?? ""), w.dateISO, csvNum(w.hours), csvCell(kind), csvCell(w.detail ?? ""), b.weeklyHours ? csvNum(b.weeklyHours) : ""]);
      }
    }
  } else {
    rows.push(
      ["Medewerker", "Kleurgroep", "Uren per week", "Opgenomen in periode (uur)", "Ingepland in periode (uur)", "Totaal in periode (uur)", "Saldo nu (uur)"].map(csvCell),
    );
    for (const e of employees) {
      const b = balances.get(e.id)!;
      const p = periodLeave(b, fromISO, toISO);
      const hasAllowance = b.buckets.length > 0;
      rows.push([
        csvCell(e.name),
        csvCell(e.colorGroup ?? ""),
        b.weeklyHours ? csvNum(b.weeklyHours) : "",
        csvNum(p.taken),
        csvNum(p.planned),
        csvNum(p.total),
        hasAllowance ? csvNum(b.available) : "",
      ]);
    }
  }
  return csvResponse(rows, `verlofuren-${perWeek ? "per-week" : "totalen"}-${fromISO}-tm-${toISO}.csv`);
}
