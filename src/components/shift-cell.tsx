"use client";

import { useState, useTransition } from "react";
import { readableTextColor } from "@/lib/format";
import { resetToTemplate, setAssignment } from "@/app/(app)/rooster/actions";

export type AvailabilityValue = "AVAILABLE" | "MORNING" | "AFTERNOON" | "UNAVAILABLE";

const AVAILABILITY_DOT: Record<AvailabilityValue, { color: string; label: string }> = {
  AVAILABLE: { color: "#16a34a", label: "Beschikbaar (hele dag)" },
  MORNING: { color: "#0ea5e9", label: "Alleen ochtend beschikbaar" },
  AFTERNOON: { color: "#f59e0b", label: "Alleen middag beschikbaar" },
  UNAVAILABLE: { color: "#dc2626", label: "Niet beschikbaar" },
};

type ShiftTypeOption = {
  id: string;
  code: string;
  label: string;
  color: string;
};

export function ShiftCell({
  employeeId,
  dateISO,
  initialShiftTypeId,
  shiftTypes,
  canEdit,
  deviates = false,
  templateLabel = "vrij",
  compact = false,
  availability = null,
}: {
  employeeId: string;
  dateISO: string;
  initialShiftTypeId: string | null;
  shiftTypes: ShiftTypeOption[];
  canEdit: boolean;
  /** Wijkt deze dag af van het vaste rooster (alleen voor vandaag en later)? */
  deviates?: boolean;
  /** Code van de dienst in het vaste rooster, of "vrij". */
  templateLabel?: string;
  /** Smal vakje (maandoverzicht): in de keuzelijst alleen de code tonen. */
  compact?: boolean;
  /** Door de medewerker doorgegeven beschikbaarheid (alleen voor de planner). */
  availability?: AvailabilityValue | null;
}) {
  const [value, setValue] = useState(initialShiftTypeId ?? "");
  const [isPending, startTransition] = useTransition();
  const current = shiftTypes.find((s) => s.id === value);

  const style = current
    ? { background: current.color, color: readableTextColor(current.color) }
    : undefined;

  const conflict = availability === "UNAVAILABLE" && !!current && current.code !== "V";
  const dot = availability ? AVAILABILITY_DOT[availability] : null;
  const dotNode = dot ? (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-0.5 left-0.5 z-10 h-1.5 w-1.5 rounded-full ring-1 ring-white/80"
      style={{ background: dot.color }}
    />
  ) : null;
  const availabilityTitle = dot
    ? `${dot.label}${conflict ? " – let op: wel ingepland" : ""}`
    : undefined;

  if (!canEdit) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded font-semibold ${
          compact ? "h-7 text-[11px]" : "h-10 text-sm"
        }`}
        style={style}
        title={current?.label}
      >
        {current?.code ?? ""}
      </div>
    );
  }

  const baseTitle = deviates
    ? `Afwijking van het vaste rooster (vast: ${templateLabel})`
    : current?.label;
  const deviationTitle = availabilityTitle
    ? `${baseTitle ? baseTitle + " · " : ""}${availabilityTitle}`
    : baseTitle;

  return (
    <div className="group relative">
    <select
      value={value}
      disabled={isPending}
      onChange={(event) => {
        const newValue = event.target.value;
        setValue(newValue);
        startTransition(async () => {
          await setAssignment({
            employeeId,
            dateISO,
            shiftTypeId: newValue || null,
          });
        });
      }}
      title={deviationTitle}
      style={style}
      className={`w-full cursor-pointer appearance-none rounded border-0 p-0 text-center font-semibold outline-none ring-inset ring-accent focus:ring-2 disabled:opacity-60 ${
        compact ? "h-7 text-[11px]" : "h-10 text-sm"
      } ${conflict ? "ring-2 ring-red-600" : deviates ? "ring-2 ring-amber-500" : ""}`}
    >
      <option value="">–</option>
      {shiftTypes.map((s) => (
        <option key={s.id} value={s.id}>
          {compact ? s.code : `${s.code} · ${s.label}`}
        </option>
      ))}
    </select>
    {dotNode}
    {deviates && (
      <button
        type="button"
        disabled={isPending}
        title={`Terug naar vast rooster (${templateLabel})`}
        aria-label={`Terug naar vast rooster (${templateLabel})`}
        onClick={() =>
          startTransition(async () => {
            await resetToTemplate({ employeeId, dateISO });
          })
        }
        className="absolute -right-1 -top-1 z-20 hidden h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] leading-none text-white shadow group-hover:flex group-focus-within:flex"
      >
        ↺
      </button>
    )}
    </div>
  );
}
