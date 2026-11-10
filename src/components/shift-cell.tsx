"use client";

import { useState, useTransition } from "react";
import { readableTextColor } from "@/lib/format";
import { resetToTemplate, setAssignment } from "@/app/(app)/rooster/actions";

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
}) {
  const [value, setValue] = useState(initialShiftTypeId ?? "");
  const [isPending, startTransition] = useTransition();
  const current = shiftTypes.find((s) => s.id === value);

  const style = current
    ? { background: current.color, color: readableTextColor(current.color) }
    : undefined;

  if (!canEdit) {
    return (
      <div
        className="flex h-8 w-full items-center justify-center rounded text-xs font-semibold"
        style={style}
        title={current?.label}
      >
        {current?.code ?? ""}
      </div>
    );
  }

  const deviationTitle = deviates
    ? `Afwijking van het vaste rooster (vast: ${templateLabel})`
    : current?.label;

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
      className={`h-8 w-full cursor-pointer appearance-none rounded border-0 text-center text-xs font-semibold outline-none ring-inset ring-accent focus:ring-2 disabled:opacity-60 ${
        deviates ? "ring-2 ring-amber-500" : ""
      }`}
    >
      <option value="">–</option>
      {shiftTypes.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code} · {s.label}
        </option>
      ))}
    </select>
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
