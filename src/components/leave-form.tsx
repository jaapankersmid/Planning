"use client";

import { useActionState } from "react";
import type { LeaveFormState } from "@/app/(app)/verlof/actions";

const inputClass = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

/** Formulier voor een verlofperiode; met `employees` kiest een planner namens wie. */
export function LeaveForm({
  action,
  submitLabel,
  minDate,
  employees,
}: {
  action: (prev: LeaveFormState, formData: FormData) => Promise<LeaveFormState>;
  submitLabel: string;
  minDate?: string;
  employees?: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-3 grid grid-cols-2 gap-3">
      {employees && (
        <select name="employeeId" required defaultValue="" className={`col-span-2 ${inputClass}`}>
          <option value="" disabled>
            Kies een medewerker
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      )}
      <label className="flex flex-col gap-1 text-xs text-foreground-muted">
        Eerste dag
        <input name="startDate" type="date" required min={minDate} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground-muted">
        Laatste dag
        <input name="endDate" type="date" required min={minDate} className={inputClass} />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="includeWeekends" defaultChecked className="h-4 w-4" />
        Zaterdag en zondag ook als vrij zetten
      </label>
      <input
        name="note"
        maxLength={300}
        placeholder="Opmerking (niet verplicht)"
        className={`col-span-2 ${inputClass}`}
      />
      <button
        type="submit"
        disabled={pending}
        className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Bezig…" : submitLabel}
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
