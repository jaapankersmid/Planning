"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAllowance, saveAllowance } from "@/app/(app)/verlofuren/actions";

/** Eén regel om het aantal verlofuren van een jaar in te vullen of aan te passen. */
export function AllowanceEditor({
  employeeId,
  year,
  hours,
  note,
  countFrom,
  exists,
}: {
  employeeId: string;
  year: number;
  hours: number | null;
  note: string | null;
  /** Peildatum (JJJJ-MM-DD) waarop het tegoed de stand is; verlof ervoor telt niet mee. */
  countFrom: string | null;
  exists: boolean;
}) {
  const router = useRouter();
  const [hoursValue, setHoursValue] = useState(hours === null ? "" : String(hours).replace(".", ","));
  const [noteValue, setNoteValue] = useState(note ?? "");
  const [countFromValue, setCountFromValue] = useState(countFrom ?? "");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = hoursValue !== (hours === null ? "" : String(hours).replace(".", ",")) || noteValue !== (note ?? "") || countFromValue !== (countFrom ?? "");

  function run(action: () => Promise<{ error: string } | undefined>) {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      if (result) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const input = "rounded-md border border-border bg-surface px-3 py-1.5 text-base text-foreground sm:text-sm";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            inputMode="decimal"
            value={hoursValue}
            onChange={(e) => {
              setHoursValue(e.target.value);
              setSaved(false);
            }}
            aria-label={`Verlofuren ${year}`}
            placeholder="uren"
            className={`${input} w-24 text-right tabular-nums`}
          />
          uur
        </label>
        <input
          value={noteValue}
          maxLength={300}
          onChange={(e) => {
            setNoteValue(e.target.value);
            setSaved(false);
          }}
          aria-label={`Opmerking ${year}`}
          placeholder="Opmerking (bv. nieuw contract per 1 maart)"
          className={`${input} min-w-0 flex-1 basis-56`}
        />
        <button
          type="button"
          disabled={isPending || !dirty}
          onClick={() => run(() => saveAllowance({ employeeId, year, hours: hoursValue, note: noteValue, countFrom: countFromValue }))}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          Opslaan
        </button>
        {exists && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(`Het tegoed van ${year} verwijderen?`)) run(() => deleteAllowance({ employeeId, year }));
            }}
            className="text-xs underline hover:no-underline disabled:opacity-50"
          >
            verwijderen
          </button>
        )}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
        Stand per (optioneel)
        <input
          type="date"
          value={countFromValue}
          min={`${year}-01-01`}
          max={`${year}-12-31`}
          onChange={(e) => {
            setCountFromValue(e.target.value);
            setSaved(false);
          }}
          className={`${input} w-40`}
        />
        <span>
          {countFromValue
            ? "Het tegoed is de stand op deze dag; verlof (V) ervoor telt niet mee."
            : "Leeg: het tegoed geldt vanaf 1 januari en alle verlof in het rooster telt mee."}
        </span>
      </label>
      {error && <p className="text-xs text-bad-text">{error}</p>}
      {saved && !error && <p className="text-xs text-foreground-muted">Opgeslagen.</p>}
    </div>
  );
}
