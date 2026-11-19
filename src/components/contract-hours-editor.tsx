"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewContract, saveContract, type ContractPreview } from "@/app/(app)/verlofuren/contract-actions";
import { dateFromISO, formatDayMonth, weekdayShort } from "@/lib/format";
import { BEGIN_ISO, mondayOfISO } from "@/lib/contract-rules";

const input = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const longDate = (iso: string) => {
  const d = dateFromISO(iso);
  return `${weekdayShort(d)} ${formatDayMonth(d)} ${d.getUTCFullYear()}`;
};
const fromText = (iso: string) => (iso === BEGIN_ISO ? "vanaf het begin" : `vanaf ${longDate(iso)}`);

export type ContractPeriod = { fromISO: string; hours: number; byName: string | null };

/**
 * Contracturen per week met een ingangsdatum (altijd de maandag van die week). Eerst "Bekijk gevolgen" (verlof en
 * overwerk voor en na, welke weken veranderen), daarna pas opslaan of verwijderen.
 */
export function ContractHoursEditor({
  employeeId,
  periods,
  fallbackHours,
  todayISO,
}: {
  employeeId: string;
  /** Opgeslagen periodes, oplopend op datum. */
  periods: ContractPeriod[];
  /** Het vaste getal als er nog geen periodes zijn (geldt dan vanaf het begin). */
  fallbackHours: number | null;
  todayISO: string;
}) {
  const router = useRouter();
  const [hours, setHours] = useState("");
  const [validFrom, setValidFrom] = useState(todayISO);
  const [remove, setRemove] = useState(false);
  const [preview, setPreview] = useState<ContractPreview | null>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();

  const thisMonday = mondayOfISO(todayISO);
  const shown: ContractPeriod[] = periods.length > 0 ? periods : fallbackHours !== null ? [{ fromISO: BEGIN_ISO, hours: fallbackHours, byName: null }] : [];
  const currentFrom = [...shown].reverse().find((p) => p.fromISO <= thisMonday)?.fromISO;
  const monday = validFrom === BEGIN_ISO ? BEGIN_ISO : /^\d{4}-\d{2}-\d{2}$/.test(validFrom) ? mondayOfISO(validFrom) : null;

  const reset = () => {
    setPreview(null);
    setMessage({});
  };
  const values = { employeeId, validFrom, hours, remove };

  function look(next: typeof values) {
    setMessage({});
    startTransition(async () => {
      const r = await previewContract(next);
      if ("error" in r) setMessage({ error: r.error });
      else if ("preview" in r) setPreview(r.preview);
    });
  }
  function save() {
    startTransition(async () => {
      const r = await saveContract(values);
      if ("error" in r) setMessage({ error: r.error });
      else if ("ok" in r) {
        setMessage({ ok: r.ok });
        setPreview(null);
        setRemove(false);
        setHours("");
        setValidFrom(todayISO);
        router.refresh();
      }
    });
  }

  const row = (label: string, before: number, after: number) => (
    <tr className="border-t border-border">
      <td className="py-1 pr-3 text-foreground-muted">{label}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{fmt(before)} uur</td>
      <td className={`py-1 text-right font-semibold tabular-nums ${Math.abs(after - before) > 0.001 ? "text-accent" : ""}`}>{fmt(after)} uur</td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-3">
      {shown.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-sm">
          {[...shown].reverse().map((p) => {
            const status = p.fromISO === currentFrom ? "geldt nu" : p.fromISO > thisMonday ? "komt nog" : "eerder";
            return (
              <li key={p.fromISO} className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 ${status === "eerder" ? "text-foreground-muted" : ""}`}>
                <span className="font-medium tabular-nums">{fmt(p.hours)} uur/week</span>
                <span>{fromText(p.fromISO)}</span>
                <span className="text-xs text-foreground-muted">({status})</span>
                {p.byName && <span className="text-xs text-foreground-muted">ingesteld door {p.byName}</span>}
                <span className="ml-auto flex gap-3 text-xs">
                  <button
                    type="button"
                    className="underline hover:no-underline"
                    onClick={() => {
                      setRemove(false);
                      setValidFrom(p.fromISO);
                      setHours(fmt(p.hours));
                      reset();
                    }}
                  >
                    aanpassen
                  </button>
                  {periods.length > 0 && (
                    <button
                      type="button"
                      className="text-bad-text underline hover:no-underline"
                      onClick={() => {
                        const next = { employeeId, validFrom: p.fromISO, hours: "", remove: true };
                        setRemove(true);
                        setValidFrom(p.fromISO);
                        setHours("");
                        look(next);
                      }}
                    >
                      verwijderen
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-300">Nog geen contracturen ingevuld: er wordt geen verlof berekend.</p>
      )}

      {!remove && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Uren per week
            <input inputMode="decimal" value={hours} onChange={(e) => { setHours(e.target.value); reset(); }} placeholder="bv. 36" className={`w-24 ${input}`} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Geldt vanaf
            {validFrom === BEGIN_ISO ? (
              <span className={`${input} text-foreground`}>
                het begin{" "}
                <button type="button" className="ml-1 text-xs underline" onClick={() => { setValidFrom(todayISO); reset(); }}>
                  datum kiezen
                </button>
              </span>
            ) : (
              <input type="date" value={validFrom} onChange={(e) => { setValidFrom(e.target.value); reset(); }} className={input} required />
            )}
          </label>
          <button
            type="button"
            disabled={pending || !hours.trim() || !monday}
            onClick={() => look(values)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-60"
          >
            {pending && !preview ? "Bezig…" : "Bekijk gevolgen"}
          </button>
        </div>
      )}
      {!remove && monday && monday !== BEGIN_ISO && (
        <p className="text-xs text-foreground-muted">
          Geldt vanaf maandag {longDate(monday).replace(/^ma /, "")}
          {monday < thisMonday && <span className="text-amber-700 dark:text-amber-300"> · ligt in het verleden: het verlof en overwerk van die weken worden opnieuw berekend</span>}
          . Een week heeft altijd één contract; ook ziekte-uren volgen het contract van die week.
        </p>
      )}

      {preview && (
        <div className="rounded-md border border-accent/40 bg-surface-muted/50 p-3 text-sm">
          <p className="font-medium">
            {remove ? `Periode ${fromText(preview.mondayISO)} verwijderen: wat er verandert` : `Wat er verandert vanaf ${preview.mondayISO === BEGIN_ISO ? "het begin" : `maandag ${longDate(preview.mondayISO).replace(/^ma /, "")}`}`}
          </p>
          {preview.retroactive && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Let op: dit verandert weken die al voorbij zijn.</p>}
          <table className="mt-2 w-full max-w-md text-sm">
            <thead>
              <tr className="text-xs text-foreground-muted">
                <th className="py-1 text-left font-normal" />
                <th className="py-1 pr-3 text-right font-normal">Nu</th>
                <th className="py-1 text-right font-normal">Daarna</th>
              </tr>
            </thead>
            <tbody>
              {row("Verlof vanaf de ingangsweek", preview.before.leaveSince, preview.after.leaveSince)}
              {(preview.before.overtimeSince > 0 || preview.after.overtimeSince > 0) && row("Overwerk vanaf de ingangsweek", preview.before.overtimeSince, preview.after.overtimeSince)}
              {row("Nu over", preview.before.available, preview.after.available)}
              {row("Verwacht 31 december", preview.before.forecastYearEnd, preview.after.forecastYearEnd)}
            </tbody>
          </table>
          {preview.changedWeeks.length > 0 ? (
            <details className="mt-2 text-xs" open={preview.changedWeeks.length <= 8}>
              <summary className="cursor-pointer text-foreground-muted">
                {preview.changedWeeks.length} {preview.changedWeeks.length === 1 ? "week verandert" : "weken veranderen"}
                {` (${longDate(preview.changedWeeks[0].dateISO).replace(/^ma /, "")} t/m ${longDate(preview.changedWeeks[preview.changedWeeks.length - 1].dateISO).replace(/^ma /, "")})`}
              </summary>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {preview.changedWeeks.map((w) => (
                  <li key={`${w.kind}-${w.dateISO}`} className="rounded border border-border bg-surface px-1.5 py-0.5 tabular-nums" title={longDate(w.dateISO)}>
                    {w.label.replace("Week ", "wk ")} {w.dateISO.slice(0, 4)} {w.kind}: {fmt(w.before)} → {fmt(w.after)}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="mt-2 text-xs text-foreground-muted">Het verlof en het overwerk veranderen niet.</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${remove ? "bg-bad text-bad-text" : "bg-accent text-accent-foreground"}`}
            >
              {pending ? "Bezig…" : remove ? "Ja, verwijderen" : "Opslaan"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setRemove(false);
              }}
              className="text-sm underline hover:no-underline"
            >
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
