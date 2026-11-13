"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWeeklyHours } from "@/app/(app)/verlofuren/actions";

/** Standaard uren per week van een medewerker (contract). Basis voor het berekenen van opgenomen verlof. */
export function WeeklyHoursEditor({ employeeId, hours, label }: { employeeId: string; hours: number | null; label: string }) {
  const router = useRouter();
  const initial = hours === null ? "" : String(hours).replace(".", ",");
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (value.trim() === initial) return;
    setError(undefined);
    startTransition(async () => {
      const result = await setWeeklyHours({ employeeId, hours: value });
      if (result) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={value}
          disabled={isPending}
          aria-label={label}
          placeholder="uren"
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-right text-base tabular-nums text-foreground sm:text-sm"
        />
        <span className="text-xs text-foreground-muted">uur/week</span>
        {saved && !error && <span className="text-xs text-foreground-muted">opgeslagen</span>}
      </span>
      {error && <span role="alert" className="text-xs text-bad-text">{error}</span>}
    </span>
  );
}
