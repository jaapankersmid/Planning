"use client";

import { useActionState } from "react";
import { createCremation, type FormState } from "@/app/(app)/klanten/actions";

const input = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";
const label = "flex flex-col gap-1 text-xs font-medium text-foreground-muted";

export function CremationForm({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCremation.bind(null, customerId),
    undefined,
  );
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          Soort dier
          <select name="animalKind" defaultValue="HUISDIER" className={input}>
            <option value="HUISDIER">Huisdier</option>
            <option value="PAARD">Paard</option>
          </select>
        </label>
        <label className={label}>
          Naam van het dier
          <input name="animalName" className={input} />
        </label>
        <label className={label}>
          Diersoort of categorie
          <input name="species" placeholder="bv. Hond, Kat, B-Pony" className={input} />
        </label>
        <label className={label}>
          Gewicht (kg)
          <input name="weightKg" inputMode="decimal" className={input} />
        </label>
        <label className={label}>
          Soort crematie
          <select name="cremationType" defaultValue="INDIVIDUEEL" className={input}>
            <option value="INDIVIDUEEL">Individueel</option>
            <option value="GEZAMENLIJK">Gezamenlijk</option>
            <option value="DIRECT">Direct</option>
          </select>
        </label>
        <label className={label}>
          Afgesproken prijs (incl. btw)
          <input name="price" inputMode="decimal" placeholder="bv. 1.250,00" className={input} />
        </label>
        <label className={label}>
          Datum overlijden
          <input name="dateOfDeath" type="date" className={input} />
        </label>
        <label className={label}>
          Ophaaldatum
          <input name="pickupDate" type="date" className={input} />
        </label>
        <label className={`${label} sm:col-span-3`}>
          Notities
          <textarea name="notes" rows={2} className={input} />
        </label>
      </div>
      {state?.error && <p className="rounded-md bg-bad px-3 py-2 text-sm text-bad-text">{state.error}</p>}
      <button disabled={pending} className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60">
        {pending ? "Bezig…" : "Crematie toevoegen"}
      </button>
    </form>
  );
}
