import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { daysInMonth, formatDayMonth, toISODate } from "@/lib/format";
import { formatHours } from "@/lib/hours";
import { todayAmsterdam } from "@/lib/schedule";
import { effectiveHours, loadEmployeeMonth, parseMonth } from "@/lib/timesheets";
import { MonthNav } from "@/components/month-nav";
import { TimesheetTable } from "@/components/timesheet-table";
import { TimesheetActions } from "@/components/timesheet-actions";
import { TimesheetStatusBadge } from "@/components/timesheet-status";
import { saveOwnEntry } from "./actions";

export default async function MijnUrenPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const employeeId = session.user.employeeId;

  if (!employeeId) {
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-lg font-semibold">Mijn uren</h1>
        <p className="text-sm text-foreground-muted">
          Je account is nog niet aan een medewerker gekoppeld, dus er zijn geen uren om te registreren.
        </p>
      </div>
    );
  }

  const { year, month } = parseMonth(await searchParams);
  const [employee, { rows, sheet }] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }),
    loadEmployeeMonth(employeeId, year, month),
  ]);

  const today = todayAmsterdam();
  const todayISO = toISODate(today);
  const days = daysInMonth(year, month);
  const canSubmit = today >= days[days.length - 1];
  const locked = sheet.status === "SUBMITTED" || sheet.status === "APPROVED";
  const worked = rows.reduce((sum, r) => sum + effectiveHours(r, todayISO), 0);
  const unconfirmed = rows.filter((r) => !r.entry && r.planned > 0 && r.dateISO <= todayISO).length;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Mijn uren</h1>
          <p className="text-sm text-foreground-muted">{employee?.name}</p>
        </div>
        <MonthNav basePath="/uren" year={year} month={month} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <TimesheetStatusBadge status={sheet.status} />
        <span>
          <strong className="tabular-nums">{formatHours(worked)}</strong> uur tot nu toe
          {unconfirmed > 0 && ` · ${unconfirmed} dag${unconfirmed === 1 ? "" : "en"} nog niet bevestigd`}
        </span>
        {sheet.status === "SUBMITTED" && sheet.submittedAt && (
          <span className="text-foreground-muted">Ingediend op {formatDayMonth(new Date(sheet.submittedAt.toISOString().slice(0, 10)))}.</span>
        )}
        {sheet.status === "APPROVED" && (
          <span className="text-foreground-muted">
            Goedgekeurd{sheet.decidedByName ? ` door ${sheet.decidedByName}` : ""}.
          </span>
        )}
        {sheet.status === "RETURNED" && sheet.decisionNote && (
          <span className="w-full text-bad-text">
            Teruggestuurd{sheet.decidedByName ? ` door ${sheet.decidedByName}` : ""}: {sheet.decisionNote}
          </span>
        )}
      </div>

      <p className="text-sm text-foreground-muted">
        De uren zijn voorgevuld met je geplande diensten (zonder pauzes). Klopt een dag, dan hoef je niets te doen;
        was je korter of langer aan het werk, pas dan de uren aan en zet er eventueel een opmerking bij. Cursieve
        uren zijn nog niet bevestigd.
      </p>

      <TimesheetTable
        key={`${year}-${month}-${sheet.status}-${rows.filter((r) => r.entry).length}`}
        rows={rows}
        todayISO={todayISO}
        editable={!locked}
        save={saveOwnEntry}
      />

      <TimesheetActions year={year} month={month} locked={locked} canSubmit={canSubmit} />
    </div>
  );
}
