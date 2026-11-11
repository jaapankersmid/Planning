"use client";

import { useActionState, useState } from "react";
import { resetPassword } from "@/app/(app)/gebruikers/actions";

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    resetPassword.bind(null, userId),
    undefined,
  );

  if (state && "tempPassword" in state) {
    return state.tempPassword ? (
      <span className="inline-flex items-center gap-1.5 text-xs">
        Nieuw:
        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">
          {state.tempPassword}
        </code>
      </span>
    ) : (
      <span className="text-xs text-foreground-muted">Wachtwoord ingesteld.</span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs underline hover:no-underline"
      >
        wachtwoord instellen
      </button>
    );
  }

  const inputClass = "rounded-md border border-border bg-surface px-2 py-1 text-xs";
  return (
    <form action={formAction} className="flex w-56 flex-col gap-1.5 text-left">
      <input
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        placeholder="Nieuw wachtwoord (leeg = genereren)"
        className={inputClass}
      />
      <input
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        placeholder="Herhaal wachtwoord"
        className={inputClass}
      />
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" name="mustChange" defaultChecked className="h-3.5 w-3.5" />
        Moet het bij inloggen wijzigen
      </label>
      <div className="flex items-center gap-3">
        <button
          disabled={isPending}
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Bezig…" : "Opslaan"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs underline hover:no-underline">
          annuleren
        </button>
      </div>
      {state && "error" in state && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
