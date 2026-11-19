import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, toISODate } from "@/lib/format";
import { formatHours } from "@/lib/hours";
import { canManageHours } from "@/lib/roles";
import { todayAmsterdam } from "@/lib/schedule";
import { effectiveHours, loadEmployeeMonth, loadShiftOptions, parseMonth, plannedHoursOf } from "@/lib/timesheets";
import { MonthNav } from "@/components/month-nav";
import { TimesheetTable } from "@/components/timesheet-table";
import { TimesheetDecision } from "@/components/timesheet-decision";
import { TimesheetStatusBadge } from "@/components/timesheet-status";
import { employeeAddress, pendingHoursChanges } from "@/lib/hours-mail";
import { isMailConfigured } from "@/lib/mail";
import { confirmSickReport, saveEntryForEmployee } from "../actions";
import { InfoTip } from "@/components/info-tip";

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

  const { rows, weekRows, sheet, weeks } = await loadEmployeeMonth(employeeId, year, month);
  const [weekMail, address, mailOn, shiftOptions] = await Promise.all([
    weeks.length ? pendingHoursChanges(employeeId, dateFromISO(weeks[0].startISO), dateFromISO(weeks[weeks.length - 1].startISO)) : {},
    employeeAddress(employeeId),
    isMailConfigured(),
    loadShiftOptions(employeeId),
  ]);
  // Waarom er na een aanpassing in een goedgekeurde week geen mail komt (of null als dat wel gebeurt).
  const mailHint = session.user.employeeId === employeeId
    ? null
    : !mailOn
      ? "Mail is niet ingesteld: aanpassingen worden niet gemaild."
      : !address?.email
        ? "Geen actief account met e-mailadres: aanpassingen worden niet gemaild."
        : null;
  const todayISO = toISODate(todayAmsterdam());
  const worked = rows.reduce((sum, r) => sum + effectiveHours(r, todayISO), 0);
  const planned = rows.reduce((sum, r) => sum + plannedHoursOf(r), 0);
  const extra = "";

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/uren/overzicht?year=${year}&month=${month}`} className="text-xs underline hover:no-underline">
            ← terug naar het overzicht
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold">
            {employee.name}
            <InfoTip>
              <span className="flex flex-col gap-1.5">
                <span>Je kunt de uren van elke dag aanpassen, ook in een ingediende of goedgekeurde maand. Cursieve uren zijn nog niet door de medewerker bevestigd.</span>
                <span>Bij elke weekregel keur je de week goed of stuur je hem terug. Bij goedkeuren krijgt de medewerker een mail met de uren; pas je daarna nog uren aan, dan volgt één mail per week met oud → nieuw.</span>
                <span>Oranje: de medewerker zegt een andere dienst te hebben gewerkt dan in het rooster. Rood: ziek gemeld.</span>
              </span>
            </InfoTip>
          </h1>
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

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/uren/export?year=${year}&month=${month}&employeeId=${employeeId}&soort=dagen`}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
        >
          Download deze maand per dag (Excel/CSV)
        </a>
        <a
          href={`/uren/export?year=${year}&month=${month}&employeeId=${employeeId}&soort=totalen`}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
        >
          Download totalen (Excel/CSV)
        </a>
      </div>

      <TimesheetDecision key={`${year}-${month}-${sheet.status}`} employeeId={employeeId} year={year} month={month} status={sheet.status} />

      <TimesheetTable
        key={`${year}-${month}-${sheet.status}-${weekRows.filter((r) => r.entry).length}-${weeks.map((w) => w.status).join("")}`}
        rows={weekRows}
        todayISO={todayISO}
        editable
        save={saveEntryForEmployee.bind(null, employeeId)}
        confirmSick={confirmSickReport.bind(null, employeeId)}
        weeks={weeks}
        weekMode="admin"
        employeeId={employeeId}
        weekMail={weekMail}
        mailHint={mailHint}
        shiftOptions={shiftOptions}
      />
    </div>
  );
}
