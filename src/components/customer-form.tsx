"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/(app)/klanten/actions";

type Values = {
  name?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  language?: string | null;
  notes?: string | null;
};

const input = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";
const label = "flex flex-col gap-1 text-xs font-medium text-foreground-muted";

export function CustomerForm({
  action,
  values = {},
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  values?: Values;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Naam *
          <input name="name" required defaultValue={values.name ?? ""} className={input} />
        </label>
        <label className={label}>
          Bedrijf (optioneel)
          <input name="companyName" defaultValue={values.companyName ?? ""} className={input} />
        </label>
        <label className={label}>
          E-mailadres
          <input name="email" type="email" defaultValue={values.email ?? ""} className={input} />
        </label>
        <label className={label}>
          Telefoon
          <input name="phone" type="tel" defaultValue={values.phone ?? ""} className={input} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Straat en huisnummer
          <input name="street" defaultValue={values.street ?? ""} className={input} />
        </label>
        <label className={label}>
          Postcode
          <input name="postalCode" defaultValue={values.postalCode ?? ""} className={input} />
        </label>
        <label className={label}>
          Plaats
          <input name="city" defaultValue={values.city ?? ""} className={input} />
        </label>
        <label className={label}>
          Land
          <select name="country" defaultValue={values.country ?? "NL"} className={input}>
            <option value="NL">Nederland</option>
            <option value="DE">Duitsland</option>
          </select>
        </label>
        <label className={label}>
          Taal voor mail en facturen
          <select name="language" defaultValue={values.language ?? "nl"} className={input}>
            <option value="nl">Nederlands</option>
            <option value="de">Duits</option>
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          Notities
          <textarea name="notes" rows={3} defaultValue={values.notes ?? ""} className={input} />
        </label>
      </div>
      {state?.error && <p className="rounded-md bg-bad px-3 py-2 text-sm text-bad-text">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60">
          {pending ? "Bezig…" : submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm text-foreground-muted hover:underline">
          Annuleren
        </Link>
      </div>
    </form>
  );
}
