"use client";

import { useState, useTransition } from "react";
import { fillEmptyDays, setAvailability } from "@/app/(app)/beschikbaarheid/actions";

export type AvailabilityValue = "AVAILABLE" | "MORNING" | "AFTERNOON" | "UNAVAILABLE";

export type GridDay = {
  iso: string;
  day: number;
  inMonth: boolean;
  weekend: boolean;
  past: boolean;
  /** Dag met verlof (V): niet te wijzigen. */
  leave: boolean;
  holiday: string | null;
  status: AvailabilityValue | null;
};

const ORDER: (AvailabilityValue | null)[] = [null, "AVAILABLE", "MORNING", "AFTERNOON", "UNAVAILABLE"];

export const AVAILABILITY_LABEL: Record<AvailabilityValue, { short: string; long: string; className: string }> = {
  AVAILABLE: { short: "Hele dag", long: "Beschikbaar (hele dag)", className: "bg-good text-good-text" },
  MORNING: { short: "Ochtend", long: "Alleen ochtend (8:00–12:30)", className: "bg-sky-200 text-sky-950 dark:bg-sky-900 dark:text-sky-100" },
  AFTERNOON: { short: "Middag", long: "Alleen middag (15:30–19:30)", className: "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100" },
  UNAVAILABLE: { short: "Niet", long: "Niet beschikbaar", className: "bg-bad text-bad-text" },
};

/** Maandraster waarin je per dag op een vakje tikt om de beschikbaarheid te wisselen. */
export function AvailabilityGrid({
  weeks,
  year,
  month,
}: {
  weeks: GridDay[][];
  year: number;
  month: number;
}) {
  const [values, setValues] = useState<Record<string, AvailabilityValue | null>>(() =>
    Object.fromEntries(weeks.flat().map((d) => [d.iso, d.status])),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cycle(day: GridDay) {
    if (day.past || day.leave || !day.inMonth) return;
    const current = values[day.iso] ?? null;
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    setValues((v) => ({ ...v, [day.iso]: next }));
    setError(null);
    startTransition(async () => {
      try {
        await setAvailability({ dateISO: day.iso, status: next });
      } catch (e) {
        setValues((v) => ({ ...v, [day.iso]: current }));
        setError(e instanceof Error ? e.message : "Opslaan is niet gelukt.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-center text-xs font-medium text-foreground-muted">
          {["ma", "di", "wo", "do", "vr", "za", "zo"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].iso} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((day) => {
              const status = values[day.iso] ?? null;
              const label = status ? AVAILABILITY_LABEL[status] : null;
              const locked = day.past || day.leave || !day.inMonth;
              return (
                <button
                  key={day.iso}
                  type="button"
                  disabled={locked}
                  onClick={() => cycle(day)}
                  title={label?.long ?? (day.leave ? "Verlof" : "Nog niet doorgegeven")}
                  className={`flex min-h-16 flex-col items-stretch gap-1 border-l border-border p-1 text-left first:border-l-0 sm:min-h-20 sm:p-1.5 ${
                    !day.inMonth
                      ? "opacity-30"
                      : day.weekend
                        ? "bg-weekend"
                        : day.holiday
                          ? "bg-holiday"
                          : ""
                  } ${day.past ? "opacity-50" : ""} ${locked ? "cursor-default" : "cursor-pointer hover:bg-surface-muted"}`}
                >
                  <span className="text-xs font-semibold tabular-nums">{day.day}</span>
                  {day.leave ? (
                    <span className="rounded bg-surface-muted px-1 py-1 text-center text-[11px] font-semibold text-foreground-muted sm:text-xs">
                      Verlof
                    </span>
                  ) : (
                    day.inMonth && (
                      <span
                        className={`rounded px-0.5 py-1 text-center text-[10px] font-semibold sm:px-1 sm:text-xs ${
                          label ? label.className : "border border-dashed border-border text-foreground-muted"
                        }`}
                      >
                        {label ? label.short : "—"}
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-bad-text">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(AVAILABILITY_LABEL) as AvailabilityValue[]).map((k) => (
          <span key={k} className={`rounded px-2 py-0.5 font-medium ${AVAILABILITY_LABEL[k].className}`}>
            {AVAILABILITY_LABEL[k].long}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await fillEmptyDays({ year, month, status: "AVAILABLE" });
                // De pagina ververst met de nieuwe waarden; hier alleen de lege dagen alvast tonen.
                setValues((v) => {
                  const next = { ...v };
                  for (const d of weeks.flat()) {
                    if (d.inMonth && !d.past && !d.leave && !next[d.iso]) next[d.iso] = "AVAILABLE";
                  }
                  return next;
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Opslaan is niet gelukt.");
              }
            })
          }
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-60"
        >
          Alle lege dagen op &ldquo;beschikbaar&rdquo; zetten
        </button>
        <span className="text-xs text-foreground-muted">Tik op een dag om te wisselen: leeg, hele dag, ochtend, middag, niet.</span>
      </div>
    </div>
  );
}
