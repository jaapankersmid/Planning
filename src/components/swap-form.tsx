"use client";

import { useActionState, useMemo, useState } from "react";
import { createSwapRequest } from "@/app/(app)/rooster/mijn/ruilen-actions";

const inputClass = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

export type SwapShiftOption = {
  id: string;
  employeeId: string;
  label: string;
  /** Alleen bij een gebroken dienst: de teksten van het losse ochtend- en middagdeel. */
  morning?: string;
  afternoon?: string;
};

/** Formulier om een eigen dienst (of alleen de ochtend of middag van een gebroken dienst) met een collega te ruilen. */
export function SwapForm({ mine, colleagues, theirs }: { mine: SwapShiftOption[]; colleagues: { id: string; name: string }[]; theirs: SwapShiftOption[] }) {
  const [state, action, pending] = useActionState(createSwapRequest, undefined);
  const [myId, setMyId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [returnId, setReturnId] = useState("");
  const my = mine.find((m) => m.id === myId);
  const ret = theirs.find((t) => t.id === returnId);
  const theirOptions = useMemo(() => theirs.filter((t) => t.employeeId === targetId), [theirs, targetId]);

  if (mine.length === 0) return <p className="text-sm text-foreground-muted">Je hebt geen komende diensten om te ruilen.</p>;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-foreground-muted sm:col-span-2">
        Mijn dienst
        <select name="assignmentId" required value={myId} onChange={(e) => setMyId(e.target.value)} className={inputClass}>
          <option value="" disabled>Kies je dienst</option>
          {mine.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      {my?.morning && my.afternoon && (
        <label className="flex flex-col gap-1 text-xs text-foreground-muted sm:col-span-2">
          Wat wil je ruilen?
          <select name="part" defaultValue="ALL" key={my.id} className={inputClass}>
            <option value="ALL">De hele dienst</option>
            <option value="MORNING">Alleen de ochtend ({my.morning})</option>
            <option value="AFTERNOON">Alleen de middag ({my.afternoon})</option>
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-foreground-muted sm:col-span-2">
        Ruilen met
        <select name="targetId" required value={targetId} onChange={(e) => { setTargetId(e.target.value); setReturnId(""); }} className={inputClass}>
          <option value="" disabled>Kies een collega</option>
          {colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {targetId && (
        <label className="flex flex-col gap-1 text-xs text-foreground-muted sm:col-span-2">
          In ruil daarvoor (niet verplicht)
          <select name="returnAssignmentId" value={returnId} onChange={(e) => setReturnId(e.target.value)} className={inputClass}>
            <option value="">Niets: de collega neemt de dienst over</option>
            {theirOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      )}
      {ret?.morning && ret.afternoon && (
        <label className="flex flex-col gap-1 text-xs text-foreground-muted sm:col-span-2">
          Welk deel van die dienst?
          <select name="returnPart" defaultValue="ALL" key={ret.id} className={inputClass}>
            <option value="ALL">De hele dienst</option>
            <option value="MORNING">Alleen de ochtend ({ret.morning})</option>
            <option value="AFTERNOON">Alleen de middag ({ret.afternoon})</option>
          </select>
        </label>
      )}
      <input name="note" maxLength={300} placeholder="Opmerking (niet verplicht)" className={`sm:col-span-2 ${inputClass}`} />
      {state?.error && <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-red-700 sm:col-span-2">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-surface-muted px-3 py-2 text-sm sm:col-span-2">{state.ok}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60 sm:col-span-2">
        {pending ? "Bezig…" : "Ruilverzoek versturen"}
      </button>
    </form>
  );
}
