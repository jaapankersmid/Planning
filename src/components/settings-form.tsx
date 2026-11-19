"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "@/app/(app)/instellingen/actions";
import { sendTestMail, type MailActionState } from "@/app/(app)/gebruikers/actions";
import { InfoTip } from "@/components/info-tip";

export type SettingField = {
  key: string;
  label: string;
  group: "company" | "mail";
  kind: string;
  help?: string;
  /** Waarde in de database ("" = niet ingevuld). */
  value: string;
  /** Wat er geldt als het veld leeg is. */
  fallback: string;
  fallbackSource: "env" | "default" | "none";
  env?: string;
};

const input = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";
const GROUPS = [
  { id: "company", title: "Bedrijfsgegevens", intro: "Staan bovenaan in de app en (als er meer dan de naam is ingevuld) onderaan in elke mail." },
  { id: "mail", title: "Mail", intro: "Voor alle roostermails, verlofmails, ruilmails en accountmails. Een fout hier kan alle mails stoppen: verstuur na het opslaan een testmail." },
] as const;

function shown(f: SettingField, v: string) {
  if (v) return f.kind === "secure" ? (v === "true" ? "ja (direct TLS)" : "nee (STARTTLS)") : v;
  if (f.fallbackSource === "env") return `leeg → uit .env: ${f.kind === "secure" ? (f.fallback === "true" ? "ja" : "nee") : f.fallback}`;
  if (f.fallbackSource === "default") return `leeg → standaard: ${f.fallback}`;
  return f.kind === "secure" ? "automatisch" : "leeg";
}

/** Instellingen bewerken met dubbele bevestiging: eerst het overzicht oud → nieuw, daarna het eigen wachtwoord. */
export function SettingsForm({ fields }: { fields: SettingField[] }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [step, setStep] = useState<"edit" | "review" | "password">("edit");
  const [understood, setUnderstood] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<MailActionState>();
  const [pending, start] = useTransition();
  const router = useRouter();

  const changed = fields.filter((f) => (values[f.key] ?? "").trim() !== f.value);
  const mailChanged = changed.some((f) => f.group === "mail");

  const reset = () => {
    setStep("edit");
    setUnderstood(false);
    setPassword("");
  };

  const save = () => {
    setMessage(null);
    start(async () => {
      const res = await saveSettings({
        changes: Object.fromEntries(changed.map((f) => [f.key, (values[f.key] ?? "").trim()])),
        expected: Object.fromEntries(changed.map((f) => [f.key, f.value])),
        acknowledged: understood,
        password,
      });
      setPassword("");
      if (res.ok) {
        setMessage({ ok: true, text: res.message });
        setStep("edit");
        setUnderstood(false);
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error });
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {message && <p className={`rounded-md px-3 py-2 text-sm ${message.ok ? "bg-good text-good-text" : "bg-bad text-bad-text"}`}>{message.text}</p>}

      {GROUPS.map((g) => (
        <section key={g.id} className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            {g.title}
            <InfoTip>{g.intro}</InfoTip>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.filter((f) => f.group === g.id).map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-xs text-foreground-muted">
                <span className="font-medium text-foreground">{f.label}</span>
                {f.kind === "secure" ? (
                  <select value={values[f.key] ?? ""} disabled={step !== "edit"} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={input}>
                    <option value="">{f.fallbackSource === "env" ? `Zoals in .env (${f.fallback === "true" ? "ja" : "nee"})` : "Automatisch"}</option>
                    <option value="true">Ja, direct TLS (meestal poort 465)</option>
                    <option value="false">Nee, STARTTLS (meestal poort 587)</option>
                  </select>
                ) : (
                  <input
                    value={values[f.key] ?? ""}
                    disabled={step !== "edit"}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.fallback ? `${f.fallbackSource === "env" ? "uit .env" : "standaard"}: ${f.fallback}` : ""}
                    inputMode={f.kind === "port" || f.kind === "minutes" ? "numeric" : undefined}
                    type={f.kind === "email" ? "email" : f.kind === "url" ? "url" : "text"}
                    maxLength={200}
                    className={input}
                  />
                )}
                {(f.help || f.env) && <span>{f.help}{f.env ? ` Leeg = ${f.env} uit .env.` : ""}</span>}
              </label>
            ))}
          </div>
          {g.id === "mail" && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => { setTest(undefined); start(async () => setTest(await sendTestMail())); }}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
              >
                Testmail versturen
              </button>
              <span className="text-xs text-foreground-muted">Naar je eigen adres, met de opgeslagen instellingen.</span>
              {test && <span className={`text-sm ${test.ok ? "text-good-text" : "text-red-700"}`}>{test.message}</span>}
            </div>
          )}
        </section>
      ))}

      {step === "edit" && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={changed.length === 0}
            onClick={() => { setMessage(null); setStep("review"); }}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            Opslaan…
          </button>
          <span className="text-xs text-foreground-muted">{changed.length === 0 ? "Nog niets gewijzigd." : `${changed.length} wijziging${changed.length === 1 ? "" : "en"}. Je ziet eerst een overzicht.`}</span>
        </div>
      )}

      {step !== "edit" && (
        <section className={`rounded-lg border-2 p-5 ${mailChanged ? "border-red-400 bg-red-50" : "border-amber-400 bg-amber-50"}`}>
          <h2 className="text-sm font-semibold">Stap 1 van 2: klopt dit?</h2>
          {mailChanged && (
            <p className="mt-1 text-sm font-medium text-red-800">
              Let op: je wijzigt de mailinstellingen. Een foutje zorgt ervoor dat er géén roostermails, verlofmails, ruilmails en accountmails meer aankomen.
            </p>
          )}
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-muted">
                <th className="py-1 pr-3 font-medium">Instelling</th>
                <th className="py-1 pr-3 font-medium">Oud</th>
                <th className="py-1 font-medium">Nieuw</th>
              </tr>
            </thead>
            <tbody>
              {changed.map((f) => (
                <tr key={f.key} className="border-t border-black/10 align-top">
                  <td className="py-1 pr-3 font-medium">{f.label}</td>
                  <td className="py-1 pr-3 break-all text-foreground-muted">{shown(f, f.value)}</td>
                  <td className="py-1 break-all">{shown(f, (values[f.key] ?? "").trim())}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {step === "review" ? (
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-4 w-4" />
                Ik heb het overzicht gecontroleerd en wil deze wijzigingen echt doorvoeren.
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={!understood} onClick={() => setStep("password")} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60">
                  Ja, verder naar stap 2
                </button>
                <button type="button" onClick={reset} className="rounded-md border border-border bg-surface px-3 py-2 text-sm">Terug</button>
              </div>
            </div>
          ) : (
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(e) => { e.preventDefault(); save(); }}
            >
              <h3 className="text-sm font-semibold">Stap 2 van 2: bevestig met je eigen wachtwoord</h3>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Je wachtwoord"
                className={`${input} max-w-xs`}
              />
              <div className="flex gap-2">
                <button disabled={pending || !password} className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
                  {pending ? "Bezig…" : "Definitief opslaan"}
                </button>
                <button type="button" onClick={reset} className="rounded-md border border-border bg-surface px-3 py-2 text-sm">Annuleren</button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
