"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewHoursOverride, saveHoursOverride, type OverridePreview } from "@/app/(app)/verlofuren/hours-override-actions";

const input = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Nieuwe regel voor afwijkende diensturen: dienst, uren (leeg = gewone uren), ingangsdatum en opmerking.
 * Eerst "Bekijk gevolgen" (verlofsaldo voor en na), daarna pas opslaan.
 */
export function HoursOverrideEditor({
  employeeId,
  shifts,
  todayISO,
}: {
  employeeId: string;
  shifts: { id: string; label: string; standard: number }[];
  todayISO: string;
}) {
  const router = useRouter();
  const [shiftTypeId, setShift] = useState("");
  const [hours, setHours] = useState("");
  const [validFrom, setValidFrom] = useState(todayISO);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<OverridePreview | null>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();

  const values = { employeeId, shiftTypeId, hours, validFrom };
  const reset = () => {
    setPreview(null);
    setMessage({});
  };
  const standard = shifts.find((s) => s.id === shiftTypeId)?.standard;

  function look() {
    setMessage({});
    startTransition(async () => {
      const r = await previewHoursOverride(values);
      if ("error" in r) setMessage({ error: r.error });
      else if ("preview" in r) setPreview(r.preview);
    });
  }
  function save() {
    startTransition(async () => {
      const r = await saveHoursOverride({ ...values, note });
      if ("error" in r) setMessage({ error: r.error });
      else if ("ok" in r) {
        setMessage({ ok: r.ok });
        setPreview(null);
        setHours("");
        setNote("");
        router.refresh();
      }
    });
  }

  const row = (label: string, before: number, after: number, unit = "uur") => (
    <tr className="border-t border-border">
      <td className="py-1 pr-3 text-foreground-muted">{label}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{fmt(before)} {unit}</td>
      <td className={`py-1 text-right font-semibold tabular-nums ${Math.abs(after - before) > 0.001 ? "text-accent" : ""}`}>
        {fmt(after)} {unit}
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Dienst
          <select value={shiftTypeId} onChange={(e) => { setShift(e.target.value); reset(); }} className={input}>
            <option value="" disabled>Kies een dienst</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Uren voor deze medewerker
          <input
            inputMode="decimal"
            value={hours}
            onChange={(e) => { setHours(e.target.value); reset(); }}
            placeholder={standard !== undefined ? `gewoon ${fmt(standard)}` : "bv. 9"}
            className={`w-28 ${input}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Geldig vanaf
          <input type="date" value={validFrom} onChange={(e) => { setValidFrom(e.target.value); reset(); }} className={input} required />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-foreground-muted">
          Opmerking (niet verplicht)
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="bv. 3 dagen van 9 uur" className={input} />
        </label>
        <button
          type="button"
          disabled={pending || !shiftTypeId || !validFrom}
          onClick={look}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-60"
        >
          {pending && !preview ? "Bezig…" : "Bekijk gevolgen"}
        </button>
      </div>
      <p className="text-xs text-foreground-muted">
        Leeg laten = vanaf die dag weer de gewone uren van de dienst. Dagen voor de ingangsdatum blijven zoals ze waren; al
        ingevulde uren veranderen niet. Ligt de ingangsdatum in het verleden, dan rekent het verlof vanaf die week opnieuw.
      </p>

      {preview && (
        <div className="rounded-md border border-accent/40 bg-surface-muted/50 p-3 text-sm">
          <p className="font-medium">Wat er verandert voor het verlof</p>
          <table className="mt-2 w-full max-w-md text-sm">
            <thead>
              <tr className="text-xs text-foreground-muted">
                <th className="py-1 text-left font-normal" />
                <th className="py-1 pr-3 text-right font-normal">Nu</th>
                <th className="py-1 text-right font-normal">Met deze regel</th>
              </tr>
            </thead>
            <tbody>
              {row("Verlof vanaf de ingangsweek", preview.before.leaveSince, preview.after.leaveSince)}
              {row("Nu over", preview.before.available, preview.after.available)}
              {row("Verwacht 31 december", preview.before.forecastYearEnd, preview.after.forecastYearEnd)}
              {row("Verwacht 30 juni", preview.before.forecast, preview.after.forecast)}
            </tbody>
          </table>
          {preview.changedWeeks.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-foreground-muted">{preview.changedWeeks.length} weken veranderen</summary>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {preview.changedWeeks.map((w) => (
                  <li key={w.label} className="rounded border border-border bg-surface px-1.5 py-0.5 tabular-nums">
                    {w.label.replace("Week ", "wk ")}: {fmt(w.before)} → {fmt(w.after)}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="mt-2 text-xs text-foreground-muted">Het verlof verandert niet (nog geen diensten van deze soort vanaf de ingangsdatum).</p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={save} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-60">
              {pending ? "Bezig…" : "Opslaan"}
            </button>
            <button type="button" onClick={reset} className="text-sm underline hover:no-underline">
              annuleren
            </button>
          </div>
        </div>
      )}
      {message.error && <p role="alert" className="text-sm text-bad-text">{message.error}</p>}
      {message.ok && <p className="text-sm text-good-text">{message.ok}</p>}
    </div>
  );
}
