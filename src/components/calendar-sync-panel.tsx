"use client";

import { useState, useTransition } from "react";
import { disconnectCalendar, setCalendarSync, syncNow } from "@/app/(app)/rooster/mijn/actions";

export function CalendarSyncPanel({
  isConnected,
  initialEnabled,
}: {
  isConnected: boolean;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [connected, setConnected] = useState(isConnected);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!connected) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground-muted">
          Nog niet gekoppeld. Verbind je Google-account om je diensten
          automatisch in je agenda te laten verschijnen.
        </p>
        <a
          href="/api/google-calendar/connect"
          className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Verbind met Google Calendar
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isPending}
          onChange={(event) => {
            const next = event.target.checked;
            setEnabled(next);
            setMessage(null);
            startTransition(async () => {
              await setCalendarSync(next);
              setMessage(
                next
                  ? "Aangezet — je diensten verschijnen in een aparte agenda “Werkrooster” in Google Calendar."
                  : "Uitgezet. Al geplaatste diensten blijven staan totdat je ze handmatig verwijdert.",
              );
            });
          }}
          className="h-4 w-4 rounded border-border"
        />
        Synchroniseer mijn diensten automatisch met Google Calendar
      </label>

      <div className="flex items-center gap-3">
        {enabled && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                const result = await syncNow();
                setMessage(
                  `Bijgewerkt: ${result.gelukt} diensten gesynchroniseerd${
                    result.mislukt ? `, ${result.mislukt} mislukt` : ""
                  }.`,
                );
              });
            }}
            className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-60"
          >
            {isPending ? "Bezig…" : "Nu opnieuw synchroniseren"}
          </button>
        )}

        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              await disconnectCalendar();
              setConnected(false);
              setEnabled(false);
              setMessage("Koppeling met Google Calendar verbroken.");
            });
          }}
          className="w-fit text-xs text-foreground-muted underline hover:no-underline disabled:opacity-60"
        >
          Loskoppelen
        </button>
      </div>

      {message && <p className="text-xs text-foreground-muted">{message}</p>}
    </div>
  );
}
