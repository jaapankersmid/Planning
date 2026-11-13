import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toISODate } from "@/lib/format";
import { formatHours } from "@/lib/hours";
import { canManageHours } from "@/lib/roles";
import { todayAmsterdam } from "@/lib/schedule";
import { effectiveHours, loadEmployeeMonth, parseMonth } from "@/lib/timesheets";
import { MonthNav } from "@/components/month-nav";
import { TimesheetTable } from "@/components/timesheet-table";
import { TimesheetDecision } from "@/components/timesheet-decision";
import { TimesheetStatusBadge } from "@/components/timesheet-status";
import { saveEntryForEmployee } from "../actions";

export default async function UrenDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const { employeeId } = await params;
  const { year, month } = parseMonth(await searchParams);
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } });
  if (!employee) notFound();

  const { rows, sheet } = await loadEmployeeMonth(employeeId, year, month);
  const todayISO = toISODate(todayAmsterdam());
  const worked = rows.reduce((sum, r) => sum + effectiveHours(r, todayISO), 0);
  const planned = rows.reduce((sum, r) => sum + r.planned, 0);
  const extra = "";

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/uren/overzicht?year=${year}&month=${month}`} className="text-xs underline hover:no-underline">
            ← terug naar het overzicht
          </Link>
          <h1 className="mt-1 text-lg font-semibold">{employee.name}</h1>
        </div>
        <MonthNav basePath={`/uren/overzicht/${employeeId}`} year={year} month={month} extra={extra} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <TimesheetStatusBadge status={sheet.status} />
        <span>
          <strong className="tabular-nums">{formatHours(worked)}</strong> uur gewerkt van {formatHours(planned)} gepland
        </span>
        {sheet.decisionNote && (
          <span className="w-full text-foreground-muted">
            {sheet.decidedByName ? `${sheet.decidedByName}: ` : ""}
            {sheet.decisionNote}
          </span>
        )}
      </div>

      <TimesheetDecision key={`${year}-${month}-${sheet.status}`} employeeId={employeeId} year={year} month={month} status={sheet.status} />

      <p className="text-sm text-foreground-muted">
        Je kunt de uren van een dag aanpassen; dat is ook mogelijk in een ingediende of goedgekeurde maand. Cursieve uren
        zijn nog niet door de medewerker bevestigd.
      </p>

      <TimesheetTable
        key={`${year}-${month}-${sheet.status}-${rows.filter((r) => r.entry).length}`}
        rows={rows}
        todayISO={todayISO}
        editable
        save={saveEntryForEmployee.bind(null, employeeId)}
      />
    </div>
  );
}
