"use client";

import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { fillEmptyDays, setAvailability } from "@/app/(app)/rooster/mijn/availability-actions";
import { AVAILABILITY_CHOICES, AVAILABILITY_LABEL, type AvailabilityValue } from "@/lib/availability-labels";
import { SwapForm, type SwapShiftOption } from "@/components/swap-form";
import { LeaveRequestForm, type PartShift, type SwapOption } from "@/components/leave-request-form";

type Data = {
  swap: { mine: SwapShiftOption[]; theirs: SwapShiftOption[]; colleagues: { id: string; name: string }[] };
  partShifts: PartShift[];
  swapOptions: SwapOption[];
  todayISO: string;
  /** Doorgegeven beschikbaarheid per dag (ISO) in de getoonde weken. */
  availability: Record<string, AvailabilityValue>;
  /** Getoonde periode en de komende dagen daarin zonder dienst (voor "lege dagen invullen"). */
  range: { fromISO: string; toISO: string };
  emptyDays: string[];
};
type Selected = { assignmentId: string; dateISO: string; label: string };
type DaySelected = { dateISO: string; label: string };

const Ctx = createContext<{
  open: (s: Selected) => void;
  openDay: (d: DaySelected) => void;
  availability: Record<string, AvailabilityValue | null>;
  fillEmpty: () => void;
  saving: boolean;
  error: string | null;
} | null>(null);

/**
 * Mijn diensten: klik op een (komende) dienst voor een popup met "Dienst ruilen" en "Vrij vragen".
 * De formulieren zijn dezelfde als elders; de gekozen dienst en datum staan alvast ingevuld.
 */
export function MyShiftActions({ data, children }: { data: Data; children: ReactNode }) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [step, setStep] = useState<"choose" | "swap" | "leave">("choose");
  const [day, setDay] = useState<DaySelected | null>(null);
  const [availability, setAvail] = useState<Record<string, AvailabilityValue | null>>(data.availability);
  const [availError, setAvailError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  useEffect(() => {
    if (!selected && !day) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      setDay(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, day]);

  function chooseAvailability(dateISO: string, status: AvailabilityValue | null) {
    const before = availability[dateISO] ?? null;
    setAvail((a) => ({ ...a, [dateISO]: status }));
    setAvailError(null);
    startTransition(async () => {
      try {
        await setAvailability({ dateISO, status });
        setDay(null);
      } catch (e) {
        setAvail((a) => ({ ...a, [dateISO]: before }));
        setAvailError(e instanceof Error ? e.message : "Opslaan is niet gelukt.");
      }
    });
  }

  const canSwap = !!selected && data.swap.mine.some((m) => m.id === selected.assignmentId);
  const big = "flex flex-col items-start gap-0.5 rounded-lg border border-border p-4 text-left hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Ctx.Provider
      value={{
        open: (s) => {
          setSelected(s);
          setStep("choose");
        },
        openDay: (d) => {
          setDay(d);
          setAvailError(null);
        },
        availability,
        saving,
        error: day ? null : availError,
        fillEmpty: () => {
          setAvailError(null);
          startTransition(async () => {
            try {
              const filled = await fillEmptyDays({ ...data.range, status: "AVAILABLE" });
              setAvail((a) => ({ ...a, ...Object.fromEntries(filled.map((iso) => [iso, "AVAILABLE" as const])) }));
            } catch (e) {
              setAvailError(e instanceof Error ? e.message : "Opslaan is niet gelukt.");
            }
          });
        },
      }}
    >
      {children}
      {day && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setDay(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-dialog-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-xl border border-border bg-surface p-5 shadow-xl sm:rounded-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="day-dialog-title" className="text-sm font-semibold">Beschikbaarheid doorgeven</h2>
                <p className="text-sm text-foreground-muted">{day.label}</p>
              </div>
              <button type="button" onClick={() => setDay(null)} aria-label="Sluiten" className="rounded-md px-2 py-1 text-lg leading-none hover:bg-surface-muted">
                ×
              </button>
            </div>
            <p className="mt-2 text-xs text-foreground-muted">Je hebt hier nog geen dienst. De planner ziet je keuze bij het inplannen.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {AVAILABILITY_CHOICES.map((status, i) => {
                const current = (availability[day.dateISO] ?? null) === status;
                return (
                  <button
                    key={status}
                    type="button"
                    autoFocus={i === 0}
                    disabled={saving}
                    onClick={() => chooseAvailability(day.dateISO, status)}
                    className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium disabled:opacity-60 ${AVAILABILITY_LABEL[status].className} ${current ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
                  >
                    {AVAILABILITY_LABEL[status].long}
                  </button>
                );
              })}
            </div>
            {availability[day.dateISO] && (
              <button type="button" disabled={saving} onClick={() => chooseAvailability(day.dateISO, null)} className="mt-3 text-xs underline hover:no-underline">
                Niets doorgeven (wissen)
              </button>
            )}
            {availError && <p className="mt-2 text-xs text-bad-text">{availError}</p>}
          </div>
        </div>
      )}
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

/** Lege dag in Mijn diensten: toont de doorgegeven beschikbaarheid en is aanklikbaar om die te wijzigen. */
export function AvailabilityCellButton({ dateISO, label, clickable }: DaySelected & { clickable: boolean }) {
  const ctx = useContext(Ctx);
  const status = ctx?.availability[dateISO] ?? null;
  const chip = status ? (
    <span className={`block rounded px-1 py-0.5 text-center text-[11px] font-medium leading-tight sm:text-left ${AVAILABILITY_LABEL[status].className}`}>
      {AVAILABILITY_LABEL[status].short}
    </span>
  ) : clickable ? (
    <span className="block rounded border border-dashed border-border px-1 py-0.5 text-center text-[11px] leading-tight text-foreground-muted opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:text-left">
      +<span className="hidden sm:inline"> beschikbaar?</span>
    </span>
  ) : null;
  if (!ctx || !clickable) return chip;
  return (
    <button
      type="button"
      onClick={() => ctx.openDay({ dateISO, label })}
      title="Klik om je beschikbaarheid door te geven"
      aria-label={`${label}: beschikbaarheid doorgeven${status ? ` (nu: ${AVAILABILITY_LABEL[status].short})` : ""}`}
      className="group block w-full flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {chip}
    </button>
  );
}

/** Onder Mijn diensten: legenda en alle lege komende dagen in één keer op beschikbaar zetten. */
export function AvailabilityTools({ emptyDays }: { emptyDays: string[] }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const open = emptyDays.filter((iso) => !ctx.availability[iso]).length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-foreground-muted">Beschikbaarheid:</span>
      {AVAILABILITY_CHOICES.map((k) => (
        <span key={k} className={`rounded px-1.5 py-0.5 font-medium ${AVAILABILITY_LABEL[k].className}`}>
          {AVAILABILITY_LABEL[k].short}
        </span>
      ))}
      {open > 0 && (
        <button
          type="button"
          disabled={ctx.saving}
          onClick={ctx.fillEmpty}
          className="rounded-md border border-border px-2 py-1 hover:bg-surface-muted disabled:opacity-60"
        >
          {open === 1 ? "De lege dag" : `Alle ${open} lege dagen`} op beschikbaar zetten
        </button>
      )}
      {ctx.error && <span role="alert" className="text-bad-text">{ctx.error}</span>}
    </div>
  );
}
