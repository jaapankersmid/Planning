import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { formatHours } from "@/lib/hours";
import { canManageHours } from "@/lib/roles";
import { loadOverview, parseMonth } from "@/lib/timesheets";
import { GroupHeaderRow } from "@/components/group-header-row";
import { MonthNav } from "@/components/month-nav";
import { TimesheetStatusBadge } from "@/components/timesheet-status";

export default async function UrenOverzichtPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const { year, month } = parseMonth(await searchParams);
  const rows = await loadOverview(year, month);

  const totals = rows.reduce((t, r) => ({ planned: t.planned + r.planned, worked: t.worked + r.worked }), { planned: 0, worked: 0 });
  const counts = {
    SUBMITTED: rows.filter((r) => r.status === "SUBMITTED").length,
    APPROVED: rows.filter((r) => r.status === "APPROVED").length,
    WEEKS: rows.reduce((sum, r) => sum + r.weeksSubmitted, 0),
  };
  const diff = (n: number) => (n === 0 ? "–" : `${n > 0 ? "+" : "−"}${formatHours(Math.abs(n))}`);
  const query = `year=${year}&month=${month}`;
  const button = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted";

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Uren</h1>
          <p className="text-sm text-foreground-muted">
            {counts.SUBMITTED > 0 ? `${counts.SUBMITTED} maand${counts.SUBMITTED === 1 ? "" : "en"} wacht${counts.SUBMITTED === 1 ? "" : "en"} op beoordeling · ` : ""}
            {counts.WEEKS > 0 ? `${counts.WEEKS} ingediende we${counts.WEEKS === 1 ? "ek" : "ken"} te beoordelen · ` : ""}
            {counts.APPROVED} van {rows.length} goedgekeurd
          </p>
        </div>
        <MonthNav basePath="/uren/overzicht" year={year} month={month} />
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={`/uren/export?${query}&soort=totalen`} className={button}>
          Download totalen (Excel/CSV)
        </a>
        <a href={`/uren/export?${query}&soort=dagen`} className={button}>
          Download per dag (Excel/CSV)
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Medewerker</th>
              <th className="px-4 py-2 text-right">Gepland</th>
              <th className="px-4 py-2 text-right">Gewerkt</th>
              <th className="px-4 py-2 text-right">Verschil</th>
              <th className="px-4 py-2">Maand</th>
              <th className="px-4 py-2">Weken</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Fragment key={r.employeeId}>
              {(i === 0 || rows[i - 1].colorGroup !== r.colorGroup) && <GroupHeaderRow group={r.colorGroup} colSpan={7} />}
              <tr className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{formatHours(r.planned)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatHours(r.worked)}
                  {r.unconfirmedDays > 0 && r.status !== "APPROVED" && (
                    <span className="ml-1 text-xs text-foreground-muted" title="Dagen die de medewerker nog niet heeft bevestigd; hier tellen de geplande uren mee.">
                      ({r.unconfirmedDays} onbevestigd)
                    </span>
                  )}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums ${Math.abs(r.worked - r.planned) > 0.001 ? "text-amber-700 dark:text-amber-300" : "text-foreground-muted"}`}>
                  {diff(Math.round((r.worked - r.planned) * 100) / 100)}
                </td>
                <td className="px-4 py-2">
                  <TimesheetStatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2 text-xs">
                  {r.weeksSubmitted > 0 && (
                    <span className="mr-1.5 inline-block rounded-full bg-amber-200 px-2 py-0.5 font-medium text-amber-950 dark:bg-amber-900 dark:text-amber-100">
                      {r.weeksSubmitted} ingediend
                    </span>
                  )}
                  {r.weeksReturned > 0 && (
                    <span className="mr-1.5 inline-block rounded-full bg-bad px-2 py-0.5 font-medium text-bad-text">
                      {r.weeksReturned} teruggestuurd
                    </span>
                  )}
                  <span className="text-foreground-muted">
                    {r.weeksApproved}/{r.weeksTotal} goedgekeurd
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/uren/overzicht/${r.employeeId}?${query}`} className="text-xs underline hover:no-underline">
                    openen
                  </Link>
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-muted font-semibold">
              <td className="px-4 py-2">Totaal</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatHours(totals.planned)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatHours(totals.worked)}</td>
              <td className="px-4 py-2" colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-foreground-muted">
        Gepland is het hele rooster van de maand; gewerkt telt de bevestigde uren, en voor dagen tot en met vandaag die
        nog niet bevestigd zijn de geplande uren. Uren zijn netto, zonder pauzes.
      </p>
    </div>
  );
}
