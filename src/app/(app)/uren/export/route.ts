import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { monthName, toISODate } from "@/lib/format";
import { canManageHours } from "@/lib/roles";
import { todayAmsterdam } from "@/lib/schedule";
import { STATUS_LABEL, effectiveHours, loadEmployeeMonth, loadOverview, parseMonth } from "@/lib/timesheets";

// Excel in Nederland verwacht puntkomma's en decimale komma's.
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;

type Target = { employeeId: string; name: string; colorGroup: string | null; planned: number; worked: number; status: keyof typeof STATUS_LABEL };

/** Eén medewerker, met dezelfde totalen als in het maandoverzicht. */
async function singleTarget(employeeId: string, year: number, month: number, todayISO: string): Promise<Target | null> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true, colorGroup: true } });
  if (!employee) return null;
  const { rows, sheet } = await loadEmployeeMonth(employeeId, year, month);
  return {
    employeeId,
    name: employee.name,
    colorGroup: employee.colorGroup,
    planned: rows.reduce((sum, r) => sum + r.planned, 0),
    worked: rows.reduce((sum, r) => sum + effectiveHours(r, todayISO), 0),
    status: sheet.status,
  };
}

/**
 * CSV-export van de uren van een maand, voor de salarisadministratie. Alleen voor planners en administratie.
 * Met ?employeeId=… alleen die medewerker; anders iedereen.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) {
    return new Response("Geen toegang.", { status: 403 });
  }
  const url = new URL(request.url);
  const { year, month } = parseMonth({
    year: url.searchParams.get("year") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
  });
  const kind = url.searchParams.get("soort") === "dagen" ? "dagen" : "totalen";
  const todayISO = toISODate(todayAmsterdam());
  const employeeId = url.searchParams.get("employeeId");
  let targets: Target[];
  if (employeeId) {
    const target = await singleTarget(employeeId, year, month, todayISO);
    if (!target) return new Response("Medewerker niet gevonden.", { status: 404 });
    targets = [target];
  } else {
    targets = await loadOverview(year, month);
  }

  const lines: string[] = [];
  if (kind === "totalen") {
    lines.push(["Medewerker", "Gepland (uur)", "Gewerkt (uur)", "Verschil (uur)", "Status", "Kleurgroep"].map(cell).join(";"));
    for (const r of targets) {
      lines.push([cell(r.name), num(r.planned), num(r.worked), num(r.worked - r.planned), cell(STATUS_LABEL[r.status]), cell(r.colorGroup ?? "")].join(";"));
    }
  } else {
    lines.push(["Medewerker", "Datum", "Dienst", "Gepland (uur)", "Gewerkt (uur)", "Opmerking", "Status", "Kleurgroep", "Week", "Weekstatus"].map(cell).join(";"));
    for (const o of targets) {
      const { rows, sheet, weeks } = await loadEmployeeMonth(o.employeeId, year, month);
      const weekByStart = new Map(weeks.map((w) => [w.startISO, w]));
      for (const r of rows) {
        const worked = effectiveHours(r, todayISO);
        if (!r.code && !r.entry && worked === 0) continue;
        lines.push(
          [cell(o.name), r.dateISO, cell(r.code ?? ""), num(r.planned), num(worked), cell(r.entry?.note ?? ""), cell(STATUS_LABEL[sheet.status]), cell(o.colorGroup ?? ""), String(weekByStart.get(r.weekStartISO)?.weekNo ?? ""), cell(STATUS_LABEL[weekByStart.get(r.weekStartISO)?.status ?? "DRAFT"])].join(";"),
        );
      }
    }
  }

  // BOM zodat Excel de tekens (é, ë) goed leest.
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const who = employeeId && targets[0] ? `-${targets[0].name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  const filename = `uren-${kind}${who}-${year}-${String(month).padStart(2, "0")}-${monthName(month)}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
