"use client";

import { useActionState, useState } from "react";
import { requestLeave, requestPartLeave } from "@/app/(app)/verlof/actions";

const inputClass = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

/** Ingeplande dienst om een dagdeel of andere dienst voor te vragen (bij een gebroken dienst met de tijden van ochtend en middag). */
export type PartShift = { id: string; label: string; morning?: string; afternoon?: string };
export type SwapOption = { id: string; label: string };

type Mode = "WHOLE" | "PART" | "CHANGE";

/**
 * Eén formulier voor alles wat een medewerker vrij kan vragen: hele dag(en) vrij, een dagdeel van een gebroken
 * dienst vrij, of een andere dienst in plaats van een ingeplande dienst. Een planner beoordeelt het verzoek.
 */
export function LeaveRequestForm({
  shifts,
  swapOptions,
  minDate,
  initialDateISO,
  initialAssignmentId,
  initialMode = "WHOLE",
}: {
  shifts: PartShift[];
  swapOptions: SwapOption[];
  minDate: string;
  initialDateISO?: string;
  initialAssignmentId?: string;
  initialMode?: Mode;
}) {
  const [wholeState, wholeAction, wholePending] = useActionState(requestLeave, undefined);
  const [partState, partAction, partPending] = useActionState(requestPartLeave, undefined);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [shiftId, setShiftId] = useState(initialAssignmentId && shifts.some((s) => s.id === initialAssignmentId) ? initialAssignmentId : "");
  const shift = shifts.find((s) => s.id === shiftId);
  const broken = !!(shift?.morning && shift.afternoon);
  const whole = mode === "WHOLE";
  const state = whole ? wholeState : partState;
  const pending = whole ? wholePending : partPending;

  const choice = (value: Mode, label: string) => (
    <label className="flex items-center gap-1.5">
      <input type="radio" name="kind" checked={mode === value} onChange={() => setMode(value)} /> {label}
    </label>
  );

  return (
    <form action={whole ? wholeAction : partAction} className="mt-3 grid grid-cols-2 gap-3">
      <fieldset className="col-span-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <legend className="mb-1 text-xs text-foreground-muted">Wat wil je vragen?</legend>
        {choice("WHOLE", "Hele dag(en) vrij")}
        {choice("PART", "Een dagdeel vrij")}
        {choice("CHANGE", "Een andere dienst")}
      </fieldset>

      {whole ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Eerste dag
            <input name="startDate" type="date" required min={minDate} defaultValue={initialDateISO} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Laatste dag
            <input name="endDate" type="date" required min={minDate} defaultValue={initialDateISO} className={inputClass} />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="includeWeekends" defaultChecked className="h-4 w-4" />
            Zaterdag en zondag ook als vrij zetten
          </label>
        </>
      ) : shifts.length === 0 ? (
        <p className="col-span-2 text-sm text-foreground-muted">Je hebt geen aankomende diensten in het rooster.</p>
      ) : (
        <>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-foreground-muted">
            Ingeplande dienst
            <select name="assignmentId" required value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Kies een dienst
              </option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="mode" value={mode} />
          {mode === "PART" && shift && !broken && (
            <p className="col-span-2 text-xs text-bad-text">
              Van deze dienst kun je geen los dagdeel vrij vragen (alleen bij een dienst met ochtend en middag). Vraag de hele
              dag vrij of een andere dienst.
            </p>
          )}
          {mode === "PART" && (!shift || broken) && (
            <fieldset className="col-span-2 flex flex-wrap gap-4 text-sm">
              <legend className="mb-1 text-xs text-foreground-muted">Welk dagdeel wil je vrij?</legend>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="part" value="MORNING" required /> Ochtend{shift?.morning ? ` (${shift.morning})` : ""}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="part" value="AFTERNOON" required /> Middag{shift?.afternoon ? ` (${shift.afternoon})` : ""}
              </label>
            </fieldset>
          )}
          {(mode === "CHANGE" || broken || !shift) && (
            <label className="col-span-2 flex flex-col gap-1 text-xs text-foreground-muted">
              {mode === "CHANGE" ? "Welke dienst wil je in plaats hiervan? (op dezelfde dag)" : "Voor welke dienst wil je dit ruilen? (niet verplicht)"}
              <select name="swapShiftTypeId" required={mode === "CHANGE"} defaultValue="" key={mode} className={inputClass}>
                <option value="">{mode === "CHANGE" ? "Kies een dienst" : "Geen voorkeur"}</option>
                {swapOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "PART" && (!shift || broken) && (
            <label className="col-span-2 flex flex-col gap-1 text-xs text-foreground-muted">
              Op welke dag? (leeg = zelfde dag, niet verplicht)
              <input name="swapDate" type="date" min={minDate} className={inputClass} />
            </label>
          )}
        </>
      )}

      <input name="note" maxLength={300} placeholder="Opmerking (niet verplicht)" className={`col-span-2 ${inputClass}`} />
      <button
        type="submit"
        disabled={pending || (!whole && (shifts.length === 0 || (mode === "PART" && !!shift && !broken)))}
        className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Bezig…" : whole ? "Verlof aanvragen" : mode === "CHANGE" ? "Andere dienst aanvragen" : "Dagdeel aanvragen"}
      </button>
      {state?.error && (
        <p role="alert" className="col-span-2 text-sm text-bad-text">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="col-span-2 text-sm text-good-text">{state.ok}</p>}
    </form>
  );
}
