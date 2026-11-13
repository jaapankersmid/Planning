"use client";

import { useState, useTransition } from "react";
import { Fragment } from "react";
import { formatDayMonth, weekdayShort } from "@/lib/format";
import { formatHours } from "@/lib/hours";
import { isLockedStatus, type WeekInfo } from "@/lib/timesheets";
import { TimesheetStatusBadge } from "@/components/timesheet-status";
import { WeekControls } from "@/components/week-controls";

export type TimesheetRow = {
  dateISO: string;
  weekStartISO: string;
  code: string | null;
  label: string | null;
  planned: number;
  entry: { hours: number; note: string | null; editedByName: string | null } | null;
};

type Save = (input: { dateISO: string; hours: string | null; note: string }) => Promise<void | { error: string } | { ok: string }>;

type Cell = {
  hours: string;
  note: string;
  confirmed: boolean;
  editedByName: string | null;
  // Laatst opgeslagen waarden, om te zien of er iets veranderd is.
  savedHours: string;
  savedNote: string;
};

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Dagtabel voor de urenregistratie: voorgevuld met de geplande uren, per dag te bevestigen of aan te passen. */
export function TimesheetTable({
  rows,
  todayISO,
  editable,
  allowFuture = false,
  save,
  weeks,
  weekMode,
  employeeId,
  monthLocked = false,
}: {
  rows: TimesheetRow[];
  todayISO: string;
  editable: boolean;
  /** Administratie mag ook uren voor later invullen; medewerkers alleen tot en met vandaag. */
  allowFuture?: boolean;
  save: Save;
  /** Per week een subtotaalregel met status en knoppen. */
  weeks: WeekInfo[];
  /** Medewerker: ingediende weken zijn vergrendeld en de week kan worden ingediend. Admin: beoordelen. */
  weekMode: "employee" | "admin";
  employeeId?: string;
  /** Medewerker: de hele maand is al ingediend of goedgekeurd. */
  monthLocked?: boolean;
}) {
  const weekByStart = new Map(weeks.map((w) => [w.startISO, w]));
  const proposal = (r: TimesheetRow) => (r.dateISO <= todayISO && r.planned > 0 ? fmt(r.planned) : "");
  const [cells, setCells] = useState<Record<string, Cell>>(() =>
    Object.fromEntries(
      rows.map((r) => {
        const hours = r.entry ? fmt(r.entry.hours) : proposal(r);
        const note = r.entry?.note ?? "";
        return [
          r.dateISO,
          { hours, note, confirmed: !!r.entry, editedByName: r.entry?.editedByName ?? null, savedHours: hours, savedNote: note },
        ];
      }),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const weekLocked = (r: TimesheetRow) => weekMode === "employee" && isLockedStatus(weekByStart.get(r.weekStartISO)?.status);
  const editableDay = (r: TimesheetRow) => editable && !weekLocked(r) && (allowFuture || r.dateISO <= todayISO);

  const liveHours = (r: TimesheetRow) => {
    const value = Number((cells[r.dateISO]?.hours ?? "").replace(",", "."));
    return Number.isFinite(value) ? value : 0;
  };

  function patch(iso: string, change: Partial<Cell>) {
    setCells((c) => ({ ...c, [iso]: { ...c[iso], ...change } }));
  }

  function commit(r: TimesheetRow) {
    const cell = cells[r.dateISO];
    const hoursText = cell.hours.trim();
    const noteText = cell.note.trim();
    if (hoursText === cell.savedHours && noteText === cell.savedNote) return;

    startTransition(async () => {
      // Uren leeg laten betekent: terug naar het voorstel uit het rooster.
      const hoursToSave = hoursText === "" ? null : hoursText;
      const result = await save({ dateISO: r.dateISO, hours: hoursToSave, note: noteText });
      if (result && "error" in result) {
        setErrors((e) => ({ ...e, [r.dateISO]: result.error }));
        return;
      }
      setErrors((e) => {
        const rest = { ...e };
        delete rest[r.dateISO];
        return rest;
      });
      const confirmed = hoursToSave !== null || noteText !== "";
      const shownHours = hoursText === "" ? proposal(r) : cell.hours;
      patch(r.dateISO, { confirmed, hours: shownHours, savedHours: hoursText === "" ? proposal(r) : hoursText, savedNote: noteText });
    });
  }

  const total = rows.reduce((sum, r) => {
    const cell = cells[r.dateISO];
    const value = Number((cell?.hours ?? "").replace(",", "."));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const plannedTotal = rows.reduce((sum, r) => sum + r.planned, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
            <th className="px-3 py-2">Dag</th>
            <th className="px-3 py-2">Dienst</th>
            <th className="px-3 py-2 text-right">Gepland</th>
            <th className="px-3 py-2">Gewerkt (uren)</th>
            <th className="px-3 py-2">Opmerking</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => {
            const cell = cells[r.dateISO];
            const nextRow = rows[index + 1];
            const endOfWeek = !nextRow || nextRow.weekStartISO !== r.weekStartISO;
            const week = weekByStart.get(r.weekStartISO);
            const weekRows = rows.filter((x) => x.weekStartISO === r.weekStartISO);
            const date = new Date(`${r.dateISO}T00:00:00Z`);
            const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
            const canEdit = editableDay(r);
            const future = r.dateISO > todayISO;
            return (
              <Fragment key={r.dateISO}>
              <tr
                className={`border-b border-border last:border-0 ${weekend ? "bg-weekend" : ""} ${future && !allowFuture ? "opacity-50" : ""}`}
              >
                <td className={`whitespace-nowrap px-3 py-1.5 ${r.dateISO === todayISO ? "font-semibold" : ""}`}>
                  {weekdayShort(date)} {date.getUTCDate()}
                </td>
                <td className="px-3 py-1.5" title={r.label ?? undefined}>
                  {r.code ?? <span className="text-foreground-muted">–</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-foreground-muted">{r.planned > 0 ? fmt(r.planned) : "–"}</td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <input
                      inputMode="decimal"
                      aria-label={`Gewerkte uren op ${r.dateISO}`}
                      value={cell.hours}
                      placeholder="0"
                      onChange={(e) => patch(r.dateISO, { hours: e.target.value })}
                      onBlur={() => commit(r)}
                      className={`w-20 rounded-md border bg-surface px-2 py-1 text-right tabular-nums text-base sm:text-sm ${
                        cell.confirmed ? "border-border font-semibold" : "border-dashed border-border italic text-foreground-muted"
                      }`}
                    />
                  ) : (
                    <span className={`tabular-nums ${cell.confirmed ? "font-semibold" : "italic text-foreground-muted"}`}>
                      {cell.hours || "–"}
                    </span>
                  )}
                  {cell.confirmed && cell.editedByName && cell.editedByName !== "" && (
                    <span className="ml-2 text-[11px] text-foreground-muted" title="Laatst gewijzigd door">
                      {cell.editedByName}
                    </span>
                  )}
                  {errors[r.dateISO] && <div className="text-xs text-bad-text">{errors[r.dateISO]}</div>}
                </td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <input
                      value={cell.note}
                      maxLength={300}
                      aria-label={`Opmerking op ${r.dateISO}`}
                      placeholder={r.dateISO <= todayISO ? "bv. overwerk" : ""}
                      onChange={(e) => patch(r.dateISO, { note: e.target.value })}
                      onBlur={() => commit(r)}
                      className="w-full min-w-32 rounded-md border border-border bg-surface px-2 py-1 text-base sm:text-sm"
                    />
                  ) : (
                    <span className="text-foreground-muted">{cell.note}</span>
                  )}
                </td>
              </tr>
              {endOfWeek && week && (() => {
                const liveInMonth = weekRows.reduce((sum, x) => sum + liveHours(x), 0);
                const plannedInMonth = weekRows.reduce((sum, x) => sum + x.planned, 0);
                const outsideMonth = week.worked - week.workedInMonth;
                const start = new Date(`${week.startISO}T00:00:00Z`);
                const end = new Date(`${week.endISO}T00:00:00Z`);
                return (
                  <tr className="border-b border-border bg-surface-muted/70 text-xs">
                    <td className="px-3 py-1.5 font-semibold" colSpan={2}>
                      Week {week.weekNo}
                      <span className="ml-1.5 font-normal text-foreground-muted">
                        {formatDayMonth(start)} – {formatDayMonth(end)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground-muted">{formatHours(plannedInMonth)}</td>
                    <td className="px-3 py-1.5 font-semibold tabular-nums" colSpan={2}>
                      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span>
                          {formatHours(liveInMonth)} uur
                          {week.partial && (
                            <span className="ml-1.5 font-normal text-foreground-muted">
                              (hele week: {formatHours(liveInMonth + outsideMonth)})
                            </span>
                          )}
                        </span>
                        {week.status !== "DRAFT" && <TimesheetStatusBadge status={week.status} />}
                        <WeekControls
                          mode={weekMode}
                          employeeId={employeeId}
                          weekStartISO={week.startISO}
                          status={week.status}
                          canSubmit={!monthLocked && todayISO >= week.endISO}
                        />
                        {week.status === "RETURNED" && week.decisionNote && (
                          <span className="w-full font-normal text-bad-text">
                            Teruggestuurd{week.decidedByName ? ` door ${week.decidedByName}` : ""}: {week.decisionNote}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })()}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-surface-muted font-semibold">
            <td className="px-3 py-2" colSpan={2}>
              Totaal
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{formatHours(plannedTotal)}</td>
            <td className="px-3 py-2 tabular-nums" colSpan={2}>
              {formatHours(total)} uur
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
