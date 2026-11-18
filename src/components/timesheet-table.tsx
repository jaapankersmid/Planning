"use client";

import { useState, useTransition } from "react";
import { Fragment } from "react";
import { formatDayMonth, monthName, weekdayShort } from "@/lib/format";
import { formatHours } from "@/lib/hours";
import { hoursFromRules, type OverrideRule } from "@/lib/shift-hours-rules";
import { isLockedStatus } from "@/lib/timesheet-labels";
import type { WeekInfo } from "@/lib/timesheets";
import { TimesheetStatusBadge } from "@/components/timesheet-status";
import { WeekControls, type PendingWeekMail } from "@/components/week-controls";

export type TimesheetRow = {
  dateISO: string;
  weekStartISO: string;
  code: string | null;
  label: string | null;
  planned: number;
  /** Geplande uren komen uit een afwijking voor deze medewerker (bv. A = 9 uur). */
  plannedOverride?: boolean;
  /** Dag valt in de getoonde maand; anders hoort hij bij de buurmaand (halve week). */
  inMonth?: boolean;
  entry: {
    hours: number;
    note: string | null;
    editedByName: string | null;
    workedShiftTypeId?: string | null;
    workedCode?: string | null;
    workedLabel?: string | null;
    /** De medewerker meldt dat hij (een deel van) de dag ziek was. */
    sickReported?: boolean;
  } | null;
};

/** Dienst die de medewerker kan kiezen als "andere dienst gewerkt". */
export type ShiftOption = { id: string; code: string; label: string; hours: number; /** Afwijkende diensturen van deze medewerker. */ rules?: OverrideRule[] };

type Save = (input: { dateISO: string; hours: string | null; note: string; workedShiftTypeId?: string | null; sickReported?: boolean }) => Promise<void | { error: string } | { ok: string }>;
type ConfirmSick = (dateISO: string) => Promise<void | { error: string } | { ok: string } | undefined>;

/** Waarde in de dienstkeuze voor "ziek geweest". */
const SICK = "__ziek__";

type Cell = {
  hours: string;
  note: string;
  confirmed: boolean;
  editedByName: string | null;
  // Laatst opgeslagen waarden, om te zien of er iets veranderd is.
  savedHours: string;
  savedNote: string;
  /** Andere dienst gewerkt (id) of "" = zoals gepland. */
  worked: string;
  savedWorked: string;
  /** Ziek gemeld door de medewerker. */
  sick: boolean;
  savedSick: boolean;
};

const cx = "px-2 py-1";
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
  weekMail,
  mailHint,
  shiftOptions = [],
  confirmSick,
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
  /** Admin: wachtende mails over aanpassingen na goedkeuring, per week (maandag-ISO). */
  weekMail?: Record<string, PendingWeekMail>;
  /** Admin: waarom de medewerker geen mail krijgt (bv. geen e-mailadres), of null. */
  mailHint?: string | null;
  /** Diensten om "andere dienst gewerkt" te kunnen aangeven. Leeg = niet mogelijk. */
  shiftOptions?: ShiftOption[];
  /** Admin: zet een ziekmelding als Z in het rooster. */
  confirmSick?: ConfirmSick;
}) {
  const optionById = new Map(shiftOptions.map((o) => [o.id, o]));
  const weekByStart = new Map(weeks.map((w) => [w.startISO, w]));
  const proposal = (r: TimesheetRow) => (r.dateISO <= todayISO && r.planned > 0 ? fmt(r.planned) : "");
  const [cells, setCells] = useState<Record<string, Cell>>(() =>
    Object.fromEntries(
      rows.map((r) => {
        const hours = r.entry ? fmt(r.entry.hours) : proposal(r);
        const note = r.entry?.note ?? "";
        const worked = r.entry?.workedShiftTypeId ?? "";
        const sick = !!r.entry?.sickReported;
        return [
          r.dateISO,
          { hours, note, worked, confirmed: !!r.entry, editedByName: r.entry?.editedByName ?? null, savedHours: hours, savedNote: note, savedWorked: worked, sick, savedSick: sick },
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

  function commit(r: TimesheetRow, next: Partial<Cell> = {}) {
    const cell = { ...cells[r.dateISO], ...next };
    const hoursText = cell.hours.trim();
    const noteText = cell.note.trim();
    if (hoursText === cell.savedHours && noteText === cell.savedNote && cell.worked === cell.savedWorked && cell.sick === cell.savedSick) return;

    startTransition(async () => {
      // Uren leeg laten betekent: terug naar het voorstel uit het rooster.
      const hoursToSave = hoursText === "" ? null : hoursText;
      const result = await save({ dateISO: r.dateISO, hours: hoursToSave, note: noteText, workedShiftTypeId: cell.worked || null, sickReported: cell.sick });
      if (result && "error" in result) {
        setErrors((e) => ({ ...e, [r.dateISO]: result.error }));
        return;
      }
      setErrors((e) => {
        const rest = { ...e };
        delete rest[r.dateISO];
        return rest;
      });
      const confirmed = hoursToSave !== null || noteText !== "" || cell.worked !== "" || cell.sick;
      const shownHours = hoursText === "" ? proposal(r) : cell.hours;
      patch(r.dateISO, { confirmed, hours: shownHours, savedHours: hoursText === "" ? proposal(r) : hoursText, savedNote: noteText, savedWorked: cell.worked, savedSick: cell.sick });
    });
  }

  // Het maandtotaal telt alleen de dagen van deze maand; de weekregels tellen de hele week.
  const total = rows.reduce((sum, r) => {
    if (r.inMonth === false) return sum;
    const cell = cells[r.dateISO];
    const value = Number((cell?.hours ?? "").replace(",", "."));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const plannedTotal = rows.reduce((sum, r) => sum + (r.inMonth === false ? 0 : r.planned), 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium text-foreground-muted">
            <th className="px-2 py-1.5">Dag</th>
            <th className="px-2 py-1.5">Dienst</th>
            <th className="px-2 py-1.5 text-right">Gepland</th>
            <th className="px-2 py-1.5">Gewerkt</th>
            <th className="px-2 py-1.5">Opmerking</th>
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
                className={`border-b border-border last:border-0 ${weekend ? "bg-weekend" : ""} ${future && !allowFuture ? "opacity-50" : ""} ${r.inMonth === false ? "bg-surface-muted/40 text-foreground-muted" : ""} ${cell.worked && weekMode === "admin" ? "bg-amber-50 dark:bg-amber-950/30" : ""} ${cell.sick && weekMode === "admin" && r.code !== "Z" ? "bg-rose-50 dark:bg-rose-950/30" : ""}`}
              >
                <td className={`whitespace-nowrap ${cx} ${r.dateISO === todayISO ? "font-semibold" : ""}`}>
                  {weekdayShort(date)} {date.getUTCDate()}
                  {r.inMonth === false && <span className="ml-1 text-xs font-normal">{monthName(date.getUTCMonth() + 1).slice(0, 3)}</span>}
                </td>
                <td className={cx} title={r.label ?? undefined}>
                  {(() => {
                    const other = cell.worked ? optionById.get(cell.worked) : undefined;
                    const otherCode = other?.code ?? (cell.worked && cell.worked === r.entry?.workedShiftTypeId ? r.entry?.workedCode : null);
                    const chip = (
                      <span className="inline-flex items-center gap-1">
                        <span className={otherCode || (cell.sick && r.code !== "Z") ? "text-foreground-muted line-through" : "font-medium"}>
                          {r.code ?? <span className="text-foreground-muted">–</span>}
                        </span>
                        {otherCode && (
                          <span
                            className="rounded bg-amber-100 px-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                            title={`Volgens de medewerker gewerkt als ${otherCode}${other ? ` (${other.label})` : ""} in plaats van ${r.code ?? "geen dienst"}`}
                          >
                            {weekMode === "admin" ? `medewerker: ${otherCode}` : otherCode}
                          </span>
                        )}
                        {cell.sick && (
                          <span
                            className="rounded bg-rose-100 px-1 text-xs font-semibold text-rose-900 dark:bg-rose-900/40 dark:text-rose-200"
                            title={r.code === "Z" ? "Ziek gemeld en verwerkt: Z staat in het rooster" : "Ziek gemeld door de medewerker; nog niet in het rooster verwerkt"}
                          >
                            {r.code === "Z" ? "ziek gemeld ✓" : weekMode === "admin" ? "medewerker: ziek" : "ziek gemeld"}
                          </span>
                        )}
                      </span>
                    );
                    const sickDone = cell.sick && r.code === "Z";
                    // Een verwerkte ziekmelding kan de medewerker niet meer zelf terugzetten.
                    if (!(canEdit && shiftOptions.length > 0) || (sickDone && weekMode === "employee")) return chip;
                    // De dienst zelf is de knop: een onzichtbare select over het label opent de keuzelijst.
                    return (
                      <label
                        className="relative inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-1.5 py-0.5 hover:border-accent hover:bg-surface-muted focus-within:ring-2 focus-within:ring-accent/50"
                        title="Klik om aan te geven dat je een andere dienst hebt gewerkt of ziek was"
                      >
                        {chip}
                        <span className="text-[10px] text-foreground-muted" aria-hidden>▾</span>
                        <select
                          value={cell.sick ? SICK : cell.worked}
                          aria-label={`Gewerkte dienst op ${r.dateISO}`}
                          onChange={(e) => {
                            const id = e.target.value;
                            const option = optionById.get(id);
                            // Ziek: 0 uur gewerkt (een deel gewerkt vul je daarna in). Andere dienst: de uren van die dienst.
                            // Terug naar het rooster = terug naar het voorstel.
                            const change: Partial<Cell> =
                              id === SICK
                                ? { sick: true, worked: "", hours: "0" }
                                : { sick: false, worked: id, hours: option ? fmt(hoursFromRules(option.rules, r.dateISO, option.hours)) : proposal(r) };
                            patch(r.dateISO, change);
                            commit(r, change);
                          }}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        >
                          <option value="">{r.code ? `${r.code} · zoals in het rooster` : "geen dienst (zoals in het rooster)"}</option>
                          {r.code !== "Z" && <option value={SICK}>Ziek geweest (hele of halve dag)</option>}
                          {shiftOptions
                            .filter((o) => o.code !== r.code)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.code} · {o.label} (andere dienst gewerkt)
                              </option>
                            ))}
                        </select>
                      </label>
                    );
                  })()}
                  {weekMode === "admin" && confirmSick && cell.sick && cell.savedSick && r.code !== "Z" && (
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          const result = await confirmSick(r.dateISO);
                          if (result && "error" in result) setErrors((e) => ({ ...e, [r.dateISO]: result.error }));
                        })
                      }
                      className="ml-1.5 rounded border border-rose-300 px-1.5 py-0.5 text-xs font-medium text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40"
                      title="Zet Z (ziek) in het rooster op deze dag; daarna telt hij in het ziekteoverzicht en de verlofuren"
                    >
                      Z in rooster
                    </button>
                  )}
                </td>
                <td className={`${cx} text-right tabular-nums text-foreground-muted`}>
                  {r.planned > 0 ? fmt(r.planned) : "–"}
                  {r.plannedOverride && r.planned > 0 && (
                    <span className="ml-1 text-[10px]" title="Afwijkende diensturen voor deze medewerker (ingesteld door de administratie)">
                      afw.
                    </span>
                  )}
                </td>
                <td className={cx}>
                  {canEdit ? (
                    <input
                      inputMode="decimal"
                      aria-label={`Gewerkte uren op ${r.dateISO}`}
                      value={cell.hours}
                      placeholder="0"
                      onChange={(e) => patch(r.dateISO, { hours: e.target.value })}
                      onBlur={() => commit(r)}
                      className={`w-16 rounded-md border bg-surface px-1.5 py-0.5 text-right tabular-nums text-base sm:text-sm ${
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
                  {cell.sick && canEdit && weekMode === "employee" && r.code !== "Z" && (
                    <div className="text-[11px] text-foreground-muted">nog gewerkt? vul de uren in</div>
                  )}
                  {errors[r.dateISO] && <div className="text-xs text-bad-text">{errors[r.dateISO]}</div>}
                </td>
                <td className={cx}>
                  {canEdit ? (
                    <input
                      value={cell.note}
                      maxLength={300}
                      aria-label={`Opmerking op ${r.dateISO}`}
                      placeholder={r.dateISO <= todayISO ? "bv. overwerk" : ""}
                      onChange={(e) => patch(r.dateISO, { note: e.target.value })}
                      onBlur={() => commit(r)}
                      className="w-full min-w-28 rounded-md border border-border bg-surface px-1.5 py-0.5 text-base sm:text-sm"
                    />
                  ) : (
                    <span className="text-foreground-muted">{cell.note}</span>
                  )}
                </td>
              </tr>
              {endOfWeek && week && (() => {
                const liveWeek = weekRows.reduce((sum, x) => sum + liveHours(x), 0);
                const plannedWeek = weekRows.reduce((sum, x) => sum + x.planned, 0);
                const liveInMonth = weekRows.filter((x) => x.inMonth !== false).reduce((sum, x) => sum + liveHours(x), 0);
                const start = new Date(`${week.startISO}T00:00:00Z`);
                const end = new Date(`${week.endISO}T00:00:00Z`);
                return (
                  <tr className="border-b border-border bg-surface-muted/70 text-xs">
                    <td className={`${cx} font-semibold`} colSpan={2}>
                      Week {week.weekNo}
                      <span className="ml-1.5 font-normal text-foreground-muted">
                        {formatDayMonth(start)} – {formatDayMonth(end)}
                      </span>
                    </td>
                    <td className={`${cx} text-right tabular-nums text-foreground-muted`}>{formatHours(plannedWeek)}</td>
                    <td className={`${cx} font-semibold tabular-nums`} colSpan={2}>
                      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span>
                          {formatHours(liveWeek)} uur
                          {week.partial && (
                            <span className="ml-1.5 font-normal text-foreground-muted">
                              (waarvan {formatHours(liveInMonth)} in deze maand)
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
                          pending={weekMail?.[week.startISO]}
                          mailHint={mailHint}
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
            <td className="px-2 py-1.5" colSpan={2}>
              Totaal
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(plannedTotal)}</td>
            <td className="px-2 py-1.5 tabular-nums" colSpan={2}>
              {formatHours(total)} uur
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
