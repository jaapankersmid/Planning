"use client";

import { useState, useTransition } from "react";
import { cancelSwap, respondToSwap } from "@/app/(app)/rooster/mijn/ruilen-actions";

const btn = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-60";

/** Accepteren of afwijzen van een ruilverzoek (voor de gevraagde collega), of intrekken (voor de aanvrager). */
export function SwapButtons({ id, mode }: { id: string; mode: "respond" | "cancel" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Het is niet gelukt.");
      }
    });
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {mode === "respond" ? (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => respondToSwap(id, true))} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60">
              Accepteren
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => respondToSwap(id, false))} className={btn}>
              Afwijzen
            </button>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => run(() => cancelSwap(id))} className={btn}>
            Verzoek intrekken
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
