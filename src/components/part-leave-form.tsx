"use client";

import { useActionState, useState } from "react";
import type { LeaveFormState } from "@/app/(app)/verlof/actions";

const inputClass = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

export type PartShift = { id: string; label: string; morning?: string; afternoon?: string };
export type SwapOption = { id: string; label: string };

/** Formulier voor dagdeel verlof: kies een ingeplande dienst, het dagdeel en eventueel voor welke dienst je wilt ruilen. */
export function PartLeaveForm({
  action,
  shifts,
  swapOptions,
  minDate,
}: {
  action: (prev: LeaveFormState, formData: FormData) => Promise<LeaveFormState>;
  shifts: PartShift[];
  swapOptions: SwapOption[];
  minDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [shiftId, setShiftId] = useState("");
  const [mode, setMode] = useState<"PART" | "CHANGE">("PART");
  const shift = shifts.find((s) => s.id === shiftId);
  const broken = !!(shift?.morning && shift.afternoon);
  const effMode = shift && !broken ? "CHANGE" : mode;

  if (shifts.length === 0) {
    return <p className="mt-3 text-sm text-foreground-muted">Je hebt geen aankomende diensten in het rooster.</p>;
  }
  return (
    <form action={formAction} className="mt-3 grid grid-cols-2 gap-3">
      <label className="col-span-2 flex flex-col gap-1 text-xs text-foreground-muted">
        Ingeplande dienst
        <select name="assignmentId" required value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={inputClass}>
          <option value="" disabled>Kies een dienst</option>
          {shifts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <input type="hidden" name="mode" value={effMode} />
      {broken && (
        <fieldset className="col-span-2 flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 text-xs text-foreground-muted">Wat wil je?</legend>
          <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "PART"} onChange={() => setMode("PART")} /> Een dagdeel vrij</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "CHANGE"} onChange={() => setMode("CHANGE")} /> Een andere dienst in plaats hiervan</label>
        </fieldset>
      )}
      {shift && !broken && <p className="col-span-2 text-xs text-foreground-muted">Van deze dienst kun je geen los dagdeel vrij vragen; je kunt wel om een andere dienst vragen.</p>}
      {effMode === "PART" && (
        <fieldset className="col-span-2 flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 text-xs text-foreground-muted">Welk dagdeel wil je vrij?</legend>
          <label className="flex items-center gap-1.5"><input type="radio" name="part" value="MORNING" required /> Ochtend{shift?.morning ? ` (${shift.morning})` : ""}</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="part" value="AFTERNOON" required /> Middag{shift?.afternoon ? ` (${shift.afternoon})` : ""}</label>
        </fieldset>
      )}
      <label className="col-span-2 flex flex-col gap-1 text-xs text-foreground-muted">
        {effMode === "CHANGE" ? "Welke dienst wil je in plaats hiervan? (op dezelfde dag)" : "Voor welke dienst wil je dit ruilen? (niet verplicht)"}
        <select name="swapShiftTypeId" required={effMode === "CHANGE"} defaultValue="" key={effMode} className={inputClass}>
          <option value="">{effMode === "CHANGE" ? "Kies een dienst" : "Geen voorkeur"}</option>
          {swapOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      {effMode === "PART" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-foreground-muted">
          Op welke dag? (leeg = zelfde dag, niet verplicht)
          <input name="swapDate" type="date" min={minDate} className={inputClass} />
        </label>
      )}
      <input name="note" maxLength={300} placeholder="Opmerking (niet verplicht)" className={`col-span-2 ${inputClass}`} />
      <button type="submit" disabled={pending} className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60">
        {pending ? "Bezig…" : effMode === "CHANGE" ? "Andere dienst aanvragen" : "Dagdeel aanvragen"}
      </button>
      {state?.error && <p role="alert" className="col-span-2 text-sm text-bad-text">{state.error}</p>}
      {state?.ok && <p className="col-span-2 text-sm text-good-text">{state.ok}</p>}
    </form>
  );
}
