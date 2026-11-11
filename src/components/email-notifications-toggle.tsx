"use client";

import { useState, useTransition } from "react";
import { setEmailNotifications, setPlannerNotifications } from "@/app/(app)/rooster/mijn/actions";

export function EmailNotificationsToggle({
  initialEnabled,
  email,
  kind = "shifts",
}: {
  initialEnabled: boolean;
  email: string;
  /** "shifts": mail over mijn eigen diensten; "planner": mail over verlofaanvragen en beschikbaarheid. */
  kind?: "shifts" | "planner";
}) {
  const save = kind === "planner" ? setPlannerNotifications : setEmailNotifications;
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={enabled}
          disabled={isPending}
          onChange={(event) => {
            const next = event.target.checked;
            setEnabled(next);
            setError(null);
            startTransition(async () => {
              try {
                await save(next);
              } catch (e) {
                setEnabled(!next);
                setError(e instanceof Error ? e.message : "Opslaan is niet gelukt.");
              }
            });
          }}
        />
        <span>
          {kind === "planner"
            ? "Stuur me een e-mail bij een nieuwe verlofaanvraag of als een medewerker de beschikbaarheid aanpast"
            : "Stuur me een e-mail als ik ben ingepland of mijn rooster wijzigt"}
          <span className="block text-xs text-foreground-muted">Naar {email}</span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-xs text-bad-text">
          {error}
        </p>
      )}
    </div>
  );
}
