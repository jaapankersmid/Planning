"use client";

import { useState, useTransition } from "react";
import { readableTextColor } from "@/lib/format";
import { setTemplateEntry } from "@/app/(app)/vast-rooster/actions";

type ShiftTypeOption = { id: string; code: string; label: string; color: string };

export function TemplateCell({
  employeeId,
  weekday,
  initialShiftTypeId,
  shiftTypes,
}: {
  employeeId: string;
  weekday: number;
  initialShiftTypeId: string | null;
  shiftTypes: ShiftTypeOption[];
}) {
  const [value, setValue] = useState(initialShiftTypeId ?? "");
  const [isPending, startTransition] = useTransition();
  const current = shiftTypes.find((s) => s.id === value);
  const style = current
    ? { background: current.color, color: readableTextColor(current.color) }
    : undefined;

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(event) => {
        const newValue = event.target.value;
        setValue(newValue);
        startTransition(async () => {
          await setTemplateEntry({ employeeId, weekday, shiftTypeId: newValue || null });
        });
      }}
      title={current?.label}
      style={style}
      className="h-8 w-full min-w-14 cursor-pointer appearance-none rounded border-0 text-center text-xs font-semibold outline-none ring-inset ring-accent focus:ring-2 disabled:opacity-60"
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
