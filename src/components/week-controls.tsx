"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TimesheetStatus } from "@prisma/client";
import { submitWeek, type ActionResult } from "@/app/(app)/uren/actions";
import { decideWeek } from "@/app/(app)/uren/overzicht/actions";

/**
 * Knoppen bij een week: de medewerker dient de week in; de administratie keurt goed, stuurt terug (met opmerking)
 * of heropent een goedgekeurde week.
 */
export function WeekControls({
  mode,
  employeeId,
  weekStartISO,
  status,
  canSubmit,
}: {
  mode: "employee" | "admin";
  employeeId?: string;
  weekStartISO: string;
  status: TimesheetStatus;
  /** Medewerker: de week is voorbij (vanaf zondag) en de maand is niet al ingediend. */
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    setResult(undefined);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (!outcome || !("error" in outcome)) {
        setReturning(false);
        setNote("");
        router.refresh();
      }
    });
  }
  const decide = (decision: "APPROVE" | "RETURN" | "REOPEN") =>
    run(() => decideWeek({ employeeId: employeeId!, weekStartISO, decision, note }));

  const small = "rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {mode === "employee" && (status === "DRAFT" || status === "RETURNED") && canSubmit && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => submitWeek({ weekStartISO }))}
          className={`${small} bg-accent text-accent-foreground hover:opacity-90`}
        >
          Week indienen
        </button>
      )}
      {mode === "admin" && status !== "APPROVED" && (
        <button type="button" disabled={isPending} onClick={() => decide("APPROVE")} className={`${small} bg-accent text-accent-foreground hover:opacity-90`}>
          Week goedkeuren
        </button>
      )}
      {mode === "admin" && status === "SUBMITTED" && !returning && (
        <button type="button" disabled={isPending} onClick={() => setReturning(true)} className={`${small} border border-border hover:bg-surface`}>
          Terugsturen
        </button>
      )}
      {mode === "admin" && status === "APPROVED" && (
        <button type="button" disabled={isPending} onClick={() => decide("REOPEN")} className={`${small} border border-border hover:bg-surface`}>
          Heropenen
        </button>
      )}
      {returning && (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <input
            autoFocus
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Wat moet er veranderen?"
            aria-label="Opmerking bij terugsturen"
            className="w-56 rounded-md border border-border bg-surface px-2 py-1 text-base text-foreground sm:text-xs"
          />
          <button type="button" disabled={isPending} onClick={() => decide("RETURN")} className={`${small} bg-accent text-accent-foreground hover:opacity-90`}>
            Verstuur
          </button>
          <button type="button" onClick={() => setReturning(false)} className="text-xs underline">
            annuleren
          </button>
        </span>
      )}
      {result && "error" in result && (
        <span role="alert" className="w-full text-xs text-bad-text">
          {result.error}
        </span>
      )}
    </span>
  );
}
