import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { daysInMonth, formatDayMonth, toISODate } from "@/lib/format";
import { formatHours } from "@/lib/hours";
import { todayAmsterdam } from "@/lib/schedule";
import { effectiveHours, loadEmployeeMonth, loadShiftOptions, parseMonth } from "@/lib/timesheets";
import { MonthNav } from "@/components/month-nav";
import { TimesheetTable } from "@/components/timesheet-table";
import { TimesheetActions } from "@/components/timesheet-actions";
import { TimesheetStatusBadge } from "@/components/timesheet-status";
import { saveOwnEntry } from "./actions";
import { InfoTip } from "@/components/info-tip";

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
  const [employee, { rows, weekRows, sheet, weeks }, shiftOptions] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }),
    loadEmployeeMonth(employeeId, year, month),
    loadShiftOptions(employeeId),
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
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            Mijn uren
            <InfoTip>
              <span className="flex flex-col gap-1.5">
                <span>Je uren staan voorgevuld met je rooster. Klopt een dag, dan hoef je niets te doen; anders pas je de uren aan. Cursieve uren zijn nog niet bevestigd.</span>
                <span>Andere dienst gewerkt? Klik op de dienst en kies wat je echt hebt gewerkt. Je rooster zelf verandert daar niet door.</span>
                <span>Ziek geweest? Klik op de dienst en kies Ziek geweest; heb je nog een deel gewerkt, vul die uren in. Vul geen klachten of reden in.</span>
                <span>Indienen kan per week (vanaf de zondag, bij de weekregel) of per maand.</span>
              </span>
            </InfoTip>
          </h1>
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

      <TimesheetTable
        key={`${year}-${month}-${sheet.status}-${weekRows.filter((r) => r.entry).length}-${weeks.map((w) => w.status).join("")}`}
        rows={weekRows}
        todayISO={todayISO}
        editable={!locked}
        save={saveOwnEntry}
        weeks={weeks}
        weekMode="employee"
        monthLocked={locked}
        shiftOptions={shiftOptions}
      />

      <TimesheetActions year={year} month={month} locked={locked} canSubmit={canSubmit} />
    </div>
  );
}
