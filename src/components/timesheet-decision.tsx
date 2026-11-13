"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TimesheetStatus } from "@prisma/client";
import { decideTimesheet } from "@/app/(app)/uren/overzicht/actions";
import type { ActionResult } from "@/app/(app)/uren/actions";

/** Voor administratie en planners: goedkeuren, terugsturen met opmerking, of een goedgekeurde maand heropenen. */
export function TimesheetDecision({
  employeeId,
  year,
  month,
  status,
}: {
  employeeId: string;
  year: number;
  month: number;
  status: TimesheetStatus;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult>();
  const [isPending, startTransition] = useTransition();

  function run(decision: "APPROVE" | "RETURN" | "REOPEN") {
    setResult(undefined);
    startTransition(async () => {
      const outcome = await decideTimesheet({ employeeId, year, month, decision, note });
      setResult(outcome);
      if (!outcome || !("error" in outcome)) {
        setNote("");
        router.refresh();
      }
    });
  }

  const button = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Beoordelen</h2>
      <label className="flex flex-col gap-1 text-xs text-foreground-muted">
        Opmerking (verplicht bij terugsturen)
        <input
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-base text-foreground sm:text-sm"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {status !== "APPROVED" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("APPROVE")}
            className={`${button} bg-accent text-accent-foreground hover:opacity-90`}
            title={status === "SUBMITTED" ? undefined : "De medewerker heeft nog niet ingediend; dagen zonder registratie krijgen de geplande uren."}
          >
            Goedkeuren
          </button>
        )}
        {status === "SUBMITTED" && (
          <button type="button" disabled={isPending} onClick={() => run("RETURN")} className={`${button} border border-border hover:bg-surface-muted`}>
            Terugsturen
          </button>
        )}
        {status === "APPROVED" && (
          <button type="button" disabled={isPending} onClick={() => run("REOPEN")} className={`${button} border border-border hover:bg-surface-muted`}>
            Heropenen
          </button>
        )}
      </div>
      {result && "error" in result && (
        <p role="alert" className="text-sm text-bad-text">
          {result.error}
        </p>
      )}
      {result && "ok" in result && (
        <p role="status" className="text-sm text-good-text">
          {result.ok}
        </p>
      )}
    </div>
  );
}
