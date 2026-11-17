"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TimesheetStatus } from "@prisma/client";
import { submitWeek, type ActionResult } from "@/app/(app)/uren/actions";
import { decideWeek, saveHoursChangeNote } from "@/app/(app)/uren/overzicht/actions";

/** Laatste melding per week; blijft bewaard als de tabel na het verversen opnieuw wordt opgebouwd. */
const flash = new Map<string, { result: ActionResult; at: number }>();

/** Wachtende mail over aanpassingen in een goedgekeurde week. */
export type PendingWeekMail = { count: number; note: string | null; failed: boolean; sendsAt: string };

/**
 * Knoppen bij een week: de medewerker dient de week in; de administratie keurt goed (met optionele opmerking voor
 * de mail), stuurt terug (met opmerking) of heropent een goedgekeurde week.
 */
export function WeekControls({
  mode,
  employeeId,
  weekStartISO,
  status,
  canSubmit,
  pending,
  mailHint,
}: {
  mode: "employee" | "admin";
  employeeId?: string;
  weekStartISO: string;
  status: TimesheetStatus;
  /** Medewerker: de week is voorbij (vanaf zondag) en de maand is niet al ingediend. */
  canSubmit: boolean;
  pending?: PendingWeekMail;
  mailHint?: string | null;
}) {
  const router = useRouter();
  const flashKey = `${employeeId ?? "zelf"}|${weekStartISO}`;
  const [result, setResult] = useState<ActionResult>(() => {
    const kept = flash.get(flashKey);
    return kept && Date.now() - kept.at < 10_000 ? kept.result : undefined;
  });
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [changeNote, setChangeNote] = useState(pending?.note ?? "");
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    setResult(undefined);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (!outcome || !("error" in outcome)) {
        flash.set(flashKey, { result: outcome, at: Date.now() });
        setReturning(false);
        setNote("");
        router.refresh();
      }
    });
  }
  const decide = (decision: "APPROVE" | "RETURN" | "REOPEN") =>
    run(() => decideWeek({ employeeId: employeeId!, weekStartISO, decision, note }));

  const small = "rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50";
  const field = "rounded-md border border-border bg-surface px-2 py-1 text-base font-normal text-foreground sm:text-xs";
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
      {mode === "admin" && status !== "APPROVED" && !returning && (
        <input
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Opmerking voor de mail (optioneel)"
          aria-label="Opmerking bij goedkeuren, gaat mee in de mail"
          className={`w-52 ${field}`}
        />
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
            className={`w-56 ${field}`}
          />
          <button type="button" disabled={isPending} onClick={() => decide("RETURN")} className={`${small} bg-accent text-accent-foreground hover:opacity-90`}>
            Verstuur
          </button>
          <button type="button" onClick={() => setReturning(false)} className="text-xs underline">
            annuleren
          </button>
        </span>
      )}
      {mode === "admin" && status === "APPROVED" && pending && (
        <span className="inline-flex w-full flex-wrap items-center gap-1.5 font-normal">
          <span className={`text-xs ${pending.failed ? "text-bad-text" : "text-foreground-muted"}`}>
            {pending.count === 1 ? "1 dag" : `${pending.count} dagen`} aangepast na goedkeuring.{" "}
            {pending.failed ? "De mail aan de medewerker is niet gelukt." : `De medewerker krijgt rond ${pending.sendsAt} één mail met oud → nieuw.`}
          </span>
          {!pending.failed && (
            <>
              <input
                value={changeNote}
                maxLength={500}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="Opmerking voor de mail (optioneel)"
                aria-label="Opmerking bij de aanpassing, gaat mee in de mail"
                className={`w-52 ${field}`}
              />
              <button
                type="button"
                disabled={isPending || changeNote.trim() === (pending.note ?? "")}
                onClick={() => run(() => saveHoursChangeNote({ employeeId: employeeId!, weekStartISO, note: changeNote }))}
                className={`${small} border border-border hover:bg-surface`}
              >
                Opmerking opslaan
              </button>
            </>
          )}
        </span>
      )}
      {mode === "admin" && status === "APPROVED" && !pending && mailHint && (
        <span className="w-full text-xs font-normal text-foreground-muted">{mailHint}</span>
      )}
      {result && "error" in result && (
        <span role="alert" className="w-full text-xs text-bad-text">
          {result.error}
        </span>
      )}
      {result && "ok" in result && (
        <span role="status" className="w-full text-xs font-normal text-good-text">
          {result.ok}
        </span>
      )}
    </span>
  );
}
