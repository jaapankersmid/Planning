"use client";

import { useState, useTransition } from "react";
import { readableTextColor } from "@/lib/format";
import { setAssignment } from "@/app/(app)/rooster/actions";

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
}: {
  employeeId: string;
  dateISO: string;
  initialShiftTypeId: string | null;
  shiftTypes: ShiftTypeOption[];
  canEdit: boolean;
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

  return (
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
      title={current?.label}
      style={style}
      className="h-8 w-full cursor-pointer appearance-none rounded border-0 text-center text-xs font-semibold outline-none ring-inset ring-accent focus:ring-2 disabled:opacity-60"
    >
      <option value="">–</option>
      {shiftTypes.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code} · {s.label}
        </option>
      ))}
    </select>
  );
}
