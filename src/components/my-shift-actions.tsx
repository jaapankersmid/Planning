"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SwapForm, type SwapShiftOption } from "@/components/swap-form";
import { LeaveRequestForm, type PartShift, type SwapOption } from "@/components/leave-request-form";

type Data = {
  swap: { mine: SwapShiftOption[]; theirs: SwapShiftOption[]; colleagues: { id: string; name: string }[] };
  partShifts: PartShift[];
  swapOptions: SwapOption[];
  todayISO: string;
};
type Selected = { assignmentId: string; dateISO: string; label: string };

const Ctx = createContext<{ open: (s: Selected) => void } | null>(null);

/**
 * Mijn diensten: klik op een (komende) dienst voor een popup met "Dienst ruilen" en "Vrij vragen".
 * De formulieren zijn dezelfde als elders; de gekozen dienst en datum staan alvast ingevuld.
 */
export function MyShiftActions({ data, children }: { data: Data; children: ReactNode }) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [step, setStep] = useState<"choose" | "swap" | "leave">("choose");

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const canSwap = !!selected && data.swap.mine.some((m) => m.id === selected.assignmentId);
  const big = "flex flex-col items-start gap-0.5 rounded-lg border border-border p-4 text-left hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Ctx.Provider
      value={{
        open: (s) => {
          setSelected(s);
          setStep("choose");
        },
      }}
    >
      {children}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setSelected(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shift-dialog-title"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-surface p-5 shadow-xl sm:rounded-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="shift-dialog-title" className="text-sm font-semibold">
                  {step === "swap" ? "Dienst ruilen" : step === "leave" ? "Vrij vragen" : "Wat wil je met deze dienst?"}
                </h2>
                <p className="text-sm text-foreground-muted">{selected.label}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Sluiten" className="rounded-md px-2 py-1 text-lg leading-none hover:bg-surface-muted">
                ×
              </button>
            </div>

            {step === "choose" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" autoFocus disabled={!canSwap} onClick={() => setStep("swap")} className={big}>
                  <span className="font-medium">Dienst ruilen</span>
                  <span className="text-xs text-foreground-muted">
                    {canSwap ? "Een collega neemt je dienst over, eventueel in ruil voor een dienst van hem of haar." : "Ruilen kan voor diensten in de komende 8 weken."}
                  </span>
                </button>
                <button type="button" onClick={() => setStep("leave")} className={big}>
                  <span className="font-medium">Vrij vragen</span>
                  <span className="text-xs text-foreground-muted">Hele dag(en), een dagdeel of een andere dienst. Een planner beoordeelt het.</span>
                </button>
              </div>
            )}

            {step === "swap" && (
              <div className="mt-3">
                <p className="mb-3 text-xs text-foreground-muted">
                  De collega krijgt een mail en ziet het verzoek bij Mijn rooster. Pas als die accepteert wordt het rooster aangepast;
                  de planner krijgt dan een mail. Bij een gebroken dienst kun je ook alleen de ochtend of de middag ruilen.
                </p>
                <SwapForm key={selected.assignmentId} mine={data.swap.mine} theirs={data.swap.theirs} colleagues={data.swap.colleagues} initialMyId={selected.assignmentId} />
              </div>
            )}

            {step === "leave" && (
              <LeaveRequestForm
                key={selected.assignmentId}
                shifts={data.partShifts}
                swapOptions={data.swapOptions}
                minDate={data.todayISO}
                initialDateISO={selected.dateISO}
                initialAssignmentId={selected.assignmentId}
              />
            )}

            {step !== "choose" && (
              <button type="button" onClick={() => setStep("choose")} className="mt-3 text-xs underline hover:no-underline">
                ← terug
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Maakt een dienst in Mijn diensten aanklikbaar. */
export function ShiftCellButton({ assignmentId, dateISO, label, children }: Selected & { children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => ctx.open({ assignmentId, dateISO, label })}
      title="Klik om te ruilen of vrij te vragen"
      aria-label={`${label}: ruilen of vrij vragen`}
      className="block w-full rounded text-inherit focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
