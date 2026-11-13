"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmAllPlanned, submitMonth, type ActionResult } from "@/app/(app)/uren/actions";

/** Knoppen voor de medewerker: alles bevestigen zoals gepland, en de maand indienen. */
export function TimesheetActions({
  year,
  month,
  locked,
  canSubmit,
}: {
  year: number;
  month: number;
  /** Ingediend of goedgekeurd: er valt niets meer te doen voor de medewerker. */
  locked: boolean;
  /** Vanaf de laatste dag van de maand. */
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    setResult(undefined);
    startTransition(async () => {
      setResult(await action());
      router.refresh();
    });
  }

  if (locked) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => confirmAllPlanned({ year, month }))}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-60"
        >
          Bevestig alle dagen zoals gepland
        </button>
        <button
          type="button"
          disabled={isPending || !canSubmit}
          onClick={() => run(() => submitMonth({ year, month }))}
          title={canSubmit ? undefined : "Kan vanaf de laatste dag van de maand"}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          Maand indienen
        </button>
        {!canSubmit && <span className="text-xs text-foreground-muted">Indienen kan vanaf de laatste dag van de maand.</span>}
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
