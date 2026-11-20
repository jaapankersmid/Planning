"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEmployee, employeeDeleteInfo, type DeleteInfo } from "@/app/(app)/medewerkers/actions";

/**
 * Medewerker definitief verwijderen, met dubbele bevestiging:
 * 1. een venster met wat er verdwijnt (en de tip om liever op inactief te zetten);
 * 2. de naam intypen voordat de knop werkt (de server controleert dat ook).
 */
export function DeleteEmployeeButton({ employeeId, name }: { employeeId: string; name: string }) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [info, setInfo] = useState<DeleteInfo | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setStep(0);
    setTyped("");
    setError(null);
  };

  function open() {
    setError(null);
    startTransition(async () => {
      const r = await employeeDeleteInfo(employeeId);
      if ("error" in r) setError(r.error);
      else {
        setInfo(r);
        setStep(1);
      }
    });
  }

  function confirm() {
    startTransition(async () => {
      const r = await deleteEmployee(employeeId, typed);
      if ("error" in r) setError(r.error);
      else {
        close();
        router.refresh();
      }
    });
  }

  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <>
      <button type="button" onClick={open} disabled={pending} className="text-xs text-bad-text underline hover:no-underline disabled:opacity-60">
        verwijderen
      </button>
      {error && step === 0 && <span className="ml-2 text-xs text-bad-text">{error}</span>}
      {step > 0 && info && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`del-${employeeId}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-xl border border-border bg-surface p-5 text-left text-sm shadow-xl sm:rounded-xl"
          >
            <h2 id={`del-${employeeId}`} className="font-semibold">
              {info.name} definitief verwijderen?
            </h2>
            {step === 1 ? (
              <>
                <p className="mt-2">Dit kan niet ongedaan worden. Alles van deze medewerker verdwijnt uit de app:</p>
                {info.counts.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 tabular-nums">
                    {info.counts.map((c) => (
                      <li key={c.label}>
                        {c.n} {c.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-foreground-muted">Er staan geen diensten, uren of verlof op naam van deze medewerker.</p>
                )}
                {info.accountEmail && (
                  <p className="mt-2 text-foreground-muted">
                    Het account {info.accountEmail} blijft bestaan, maar is daarna niet meer aan een medewerker gekoppeld.
                  </p>
                )}
                <p className="mt-2 rounded-md bg-surface-muted px-3 py-2 text-xs">
                  Is iemand uit dienst? Dan is <strong>op inactief zetten</strong> meestal beter: de geschiedenis (uren, verlof, ziekte)
                  blijft dan bewaard.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
                    Annuleren
                  </button>
                  <button type="button" autoFocus={false} onClick={() => setStep(2)} className="rounded-md bg-bad px-3 py-1.5 font-medium text-bad-text">
                    Doorgaan
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="mt-2 flex flex-col gap-1">
                  <span>
                    Typ ter bevestiging de naam: <strong>{info.name}</strong>
                  </span>
                  <input
                    autoFocus
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && matches && !pending && confirm()}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-base sm:text-sm"
                  />
                </label>
                {error && <p className="mt-2 text-bad-text">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
                    Annuleren
                  </button>
                  <button
                    type="button"
                    disabled={!matches || pending}
                    onClick={confirm}
                    className="rounded-md bg-bad px-3 py-1.5 font-medium text-bad-text disabled:opacity-50"
                  >
                    {pending ? "Bezig…" : "Definitief verwijderen"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
