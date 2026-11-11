"use client";

import { useState, useTransition } from "react";
import { sendPendingNow, sendTestMail, type MailActionState } from "@/app/(app)/gebruikers/actions";

export function MailStatusPanel({
  configured,
  pending,
  delayMinutes,
}: {
  configured: boolean;
  pending: number;
  delayMinutes: number;
}) {
  const [result, setResult] = useState<MailActionState>();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<MailActionState>) {
    setResult(undefined);
    startTransition(async () => setResult(await action()));
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">E-mailmeldingen</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            configured ? "bg-good text-good-text" : "bg-bad text-bad-text"
          }`}
        >
          {configured ? "ingesteld" : "niet ingesteld"}
        </span>
      </div>
      <p className="mt-1 text-sm text-foreground-muted">
        {configured
          ? `Medewerkers krijgen één gebundelde mail zodra jij ${delayMinutes} minuten niets meer hebt gewijzigd.`
          : "Vul SMTP_HOST, SMTP_USER en SMTP_PASSWORD in het .env-bestand op de server in en herstart de app. Zie de README."}
        {configured && pending > 0 && ` Nu wacht${pending === 1 ? "" : "en"} er ${pending} medewerker${pending === 1 ? "" : "s"} op een mail.`}
      </p>
      {configured && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(sendTestMail)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-60"
          >
            Stuur testmail naar mezelf
          </button>
          <button
            type="button"
            disabled={isPending || pending === 0}
            onClick={() => run(sendPendingNow)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-60"
          >
            Verstuur wachtende meldingen nu
          </button>
        </div>
      )}
      {result && (
        <p role="status" className={`mt-2 text-sm ${result.ok ? "text-good-text" : "text-bad-text"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
