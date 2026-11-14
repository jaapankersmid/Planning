"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { sendFeedback } from "@/app/feedback-actions";

const KINDS = ["Idee", "Probleem", "Vraag", "Compliment"];

/** Kleine zwevende feedbackknop. Het bericht gaat per mail naar de beheerder, met naam en pagina erbij. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [state, formAction, pending] = useActionState(sendFeedback, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open ? (
        <form ref={ref} action={formAction} className="flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Feedback</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Sluiten" className="rounded px-2 text-foreground-muted hover:bg-surface-muted">×</button>
          </div>
          <input type="hidden" name="page" value={pathname} />
          <select name="kind" defaultValue="Idee" className="rounded-md border border-border bg-surface px-2 py-1.5">
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <textarea name="message" required minLength={3} maxLength={4000} rows={5} placeholder="Wat gaat goed, wat kan beter, wat mis je?" className="rounded-md border border-border bg-surface px-2 py-1.5" />
          {state?.error && <p className="text-xs text-bad-text">{state.error}</p>}
          {state?.ok && <p className="text-xs text-accent">Bedankt, je feedback is verstuurd.</p>}
          <button disabled={pending} className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-foreground disabled:opacity-60">{pending ? "Versturen…" : "Versturen"}</button>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium shadow-md hover:bg-surface-muted">Feedback</button>
      )}
    </div>
  );
}
