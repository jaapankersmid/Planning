"use client";

import { useActionState } from "react";
import { resetPassword } from "@/app/(app)/gebruikers/actions";

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [state, formAction, isPending] = useActionState(
    resetPassword.bind(null, userId),
    undefined,
  );

  if (state && "tempPassword" in state) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        Nieuw:
        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">
          {state.tempPassword}
        </code>
      </span>
    );
  }

  return (
    <form action={formAction}>
      <button disabled={isPending} className="text-xs underline hover:no-underline disabled:opacity-60">
        {isPending ? "Bezig…" : "wachtwoord resetten"}
      </button>
      {state && "error" in state && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
