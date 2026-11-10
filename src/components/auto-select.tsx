"use client";

import { useState, useTransition } from "react";

type Option = { value: string; label: string };

/** Keuzelijst die bij elke wijziging meteen een server-actie uitvoert. */
export function AutoSelect({
  initialValue,
  options,
  emptyLabel,
  action,
  ariaLabel,
}: {
  initialValue: string;
  options: Option[];
  emptyLabel: string;
  action: (value: string | null) => Promise<void | { error: string }>;
  ariaLabel: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={isPending}
        onChange={(event) => {
          const previous = value;
          const next = event.target.value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const result = await action(next || null);
            if (result && "error" in result) {
              setValue(previous);
              setError(result.error);
            }
          });
        }}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm disabled:opacity-60"
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
