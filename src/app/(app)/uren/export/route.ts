import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { monthName, toISODate } from "@/lib/format";
import { canManageHours } from "@/lib/roles";
import { todayAmsterdam } from "@/lib/schedule";
import { STATUS_LABEL, effectiveHours, loadEmployeeMonth, loadOverview, parseMonth } from "@/lib/timesheets";

// Excel in Nederland verwacht puntkomma's en decimale komma's.
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** CSV-export van de uren van een maand, voor de salarisadministratie. Alleen voor planners en administratie. */
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

  const lines: string[] = [];
  if (kind === "totalen") {
    lines.push(["Medewerker", "Gepland (uur)", "Gewerkt (uur)", "Verschil (uur)", "Status", "Kleurgroep"].map(cell).join(";"));
    for (const r of await loadOverview(year, month)) {
      lines.push([cell(r.name), num(r.planned), num(r.worked), num(r.worked - r.planned), cell(STATUS_LABEL[r.status]), cell(r.colorGroup ?? "")].join(";"));
    }
  } else {
    lines.push(["Medewerker", "Datum", "Dienst", "Gepland (uur)", "Gewerkt (uur)", "Opmerking", "Status", "Kleurgroep"].map(cell).join(";"));
    const overview = await loadOverview(year, month);
    const employees = await prisma.employee.findMany({ where: { id: { in: overview.map((o) => o.employeeId) } }, select: { id: true, name: true } });
    const names = new Map(employees.map((e) => [e.id, e.name]));
    for (const o of overview) {
      const { rows, sheet } = await loadEmployeeMonth(o.employeeId, year, month);
      for (const r of rows) {
        const worked = effectiveHours(r, todayISO);
        if (!r.code && !r.entry && worked === 0) continue;
        lines.push(
          [cell(names.get(o.employeeId) ?? ""), r.dateISO, cell(r.code ?? ""), num(r.planned), num(worked), cell(r.entry?.note ?? ""), cell(STATUS_LABEL[sheet.status]), cell(o.colorGroup ?? "")].join(";"),
        );
      }
    }
  }

  // BOM zodat Excel de tekens (é, ë) goed leest.
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const filename = `uren-${kind}-${year}-${String(month).padStart(2, "0")}-${monthName(month)}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
