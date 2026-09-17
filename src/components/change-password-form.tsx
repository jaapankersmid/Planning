"use client";

import { useActionState } from "react";
import { changeOwnPassword } from "@/app/wachtwoord-wijzigen/actions";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction, isPending] = useActionState(changeOwnPassword, undefined);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3">
      {!forced && (
        <div className="flex flex-col gap-1">
          <label htmlFor="currentPassword" className="text-xs font-medium text-foreground-muted">
            Huidig wachtwoord
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
      )}
      {forced && (
        <div className="flex flex-col gap-1">
          <label htmlFor="currentPassword" className="text-xs font-medium text-foreground-muted">
            Tijdelijk wachtwoord (van je leidinggevende)
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="newPassword" className="text-xs font-medium text-foreground-muted">
          Nieuw wachtwoord (min. 8 tekens)
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-xs font-medium text-foreground-muted">
          Nieuw wachtwoord (herhaal)
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>

      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="mt-1 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "Bezig…" : "Wachtwoord instellen"}
      </button>
    </form>
  );
}
