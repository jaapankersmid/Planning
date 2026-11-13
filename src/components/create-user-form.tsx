"use client";

import { useActionState } from "react";
import { createUser } from "@/app/(app)/gebruikers/actions";

export function CreateUserForm({
  unclaimedEmployees,
}: {
  unclaimedEmployees: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(createUser, undefined);
  const success = state && "success" in state ? state.success : null;

  return (
    <div className="max-w-sm rounded-lg border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Nieuwe gebruiker</h2>

      {success ? (
        <div className="mt-3 flex flex-col gap-2 rounded-md bg-accent-soft p-3 text-sm">
          <p>
            Account aangemaakt voor <strong>{success.email}</strong>.
          </p>
          {success.tempPassword ? (
            <>
              <p>Tijdelijk wachtwoord (nu doorgeven, wordt niet nogmaals getoond):</p>
              <code className="rounded bg-surface px-2 py-1 font-mono text-sm">
                {success.tempPassword}
              </code>
            </>
          ) : (
            <p>Het wachtwoord dat je hebt ingesteld is opgeslagen.</p>
          )}
          <p className="text-xs text-foreground-muted">
            {success.mustChange
              ? "Bij de eerste keer inloggen wordt om een eigen wachtwoord gevraagd."
              : "De gebruiker hoeft het wachtwoord bij het inloggen niet te wijzigen."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1 w-fit text-xs underline hover:no-underline"
          >
            Nog een gebruiker aanmaken
          </button>
        </div>
      ) : (
        <form action={formAction} className="mt-3 flex flex-col gap-3">
          <input
            name="name"
            required
            placeholder="Naam"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="E-mailadres"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <select
            name="role"
            defaultValue="ADMIN"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="ADMIN">Planner (volledige rechten)</option>
            <option value="ACCOUNTING">Administratie</option>
            <option value="EMPLOYEE">Medewerker</option>
          </select>
          <select
            name="employeeId"
            defaultValue=""
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">Niet koppelen aan een medewerker</option>
            {unclaimedEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-xs text-foreground-muted">Wachtwoord</legend>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="Zelf een wachtwoord kiezen (min. 8 tekens)"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              placeholder="Herhaal het wachtwoord"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="mustChange" defaultChecked className="h-4 w-4" />
              Gebruiker moet het wachtwoord bij de eerste keer inloggen wijzigen
            </label>
            <p className="text-xs text-foreground-muted">
              Laat beide velden leeg om een tijdelijk wachtwoord te laten genereren.
            </p>
          </fieldset>

          {state && "error" in state && (
            <p role="alert" className="text-xs text-red-600">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? "Bezig…" : "Account aanmaken"}
          </button>
        </form>
      )}
    </div>
  );
}
