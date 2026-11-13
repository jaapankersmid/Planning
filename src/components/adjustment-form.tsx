"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAdjustment } from "@/app/(app)/verlofuren/actions";

/** Correctie (+/− uren) op het tegoed van een jaar, met datum en reden. */
export function AdjustmentForm({ employeeId, years, todayISO }: { employeeId: string; years: number[]; todayISO: string }) {
  const router = useRouter();
  const [year, setYear] = useState(String(years.includes(Number(todayISO.slice(0, 4))) ? todayISO.slice(0, 4) : years[0]));
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(todayISO);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setDone(false);
    startTransition(async () => {
      const result = await addAdjustment({ employeeId, year: Number(year), hours, date, reason });
      if (result) setError(result.error);
      else {
        setHours("");
        setReason("");
        setDone(true);
        router.refresh();
      }
    });
  }

  const input = "rounded-md border border-border bg-surface px-3 py-1.5 text-base text-foreground sm:text-sm";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold">Correctie boeken</h2>
        <p className="text-xs text-foreground-muted">
          Verreken uren anders: boek uren bij (bijvoorbeeld 8) of af (bijvoorbeeld -4) op het tegoed van een jaar. De datum
          en reden blijven in het overzicht staan, ook voor de medewerker. Een correctie kun je niet wijzigen; boek bij een
          vergissing een tegengestelde correctie.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Tegoed van jaar
          <select value={year} onChange={(e) => setYear(e.target.value)} className={input}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Uren (+ of −)
          <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="-4" className={`${input} w-24 text-right tabular-nums`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Datum
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label className="flex min-w-0 flex-1 basis-60 flex-col gap-1 text-xs text-foreground-muted">
          Reden (verplicht)
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="bv. nieuw contract per 1 maart" className={input} />
        </label>
        <button disabled={isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50">
          Boeken
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-bad-text">{error}</p>}
      {done && !error && <p role="status" className="text-xs text-foreground-muted">Correctie geboekt.</p>}
    </form>
  );
}
