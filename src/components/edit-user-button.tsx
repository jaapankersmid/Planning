"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUser } from "@/app/(app)/gebruikers/actions";

/** Naam en e-mailadres van een gebruiker aanpassen (rol, medewerker en crematorium staan al in de tabel). */
export function EditUserButton({ userId, name, email }: { userId: string; name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name, email });
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();
  const input = "rounded-md border border-border bg-surface px-2 py-1.5 text-base sm:text-sm";

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateUser(userId, values);
      if ("error" in r) setMessage({ error: r.error });
      else {
        setMessage({ ok: r.ok });
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValues({ name, email });
          setMessage({});
          setOpen(true);
        }}
        className="text-xs underline hover:no-underline"
      >
        aanpassen
      </button>
      {message.ok && !open && <span className="text-xs text-good-text">{message.ok}</span>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-${userId}`}
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
            className="flex w-full max-w-sm flex-col gap-3 rounded-t-xl border border-border bg-surface p-5 text-left text-sm shadow-xl sm:rounded-xl"
          >
            <h2 id={`edit-${userId}`} className="font-semibold">
              Gebruiker aanpassen
            </h2>
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              Naam
              <input autoFocus required maxLength={100} value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              E-mailadres (om in te loggen)
              <input type="email" required maxLength={200} value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} className={input} />
            </label>
            {values.email.trim().toLowerCase() !== email.toLowerCase() && (
              <p className="text-xs text-amber-700 dark:text-amber-300">Na opslaan logt deze gebruiker in met het nieuwe e-mailadres; het wachtwoord blijft hetzelfde.</p>
            )}
            {message.error && <p className="text-xs text-bad-text">{message.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
                Annuleren
              </button>
              <button disabled={pending} className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-foreground disabled:opacity-60">
                {pending ? "Bezig…" : "Opslaan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
