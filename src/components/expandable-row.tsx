"use client";

import { useState, type ReactNode } from "react";

/** Tabelrij die met een klik een detailrij eronder open- en dichtklapt. */
export function ExpandableRow({ cells, detail, colSpan }: { cells: ReactNode; detail: ReactNode | null; colSpan: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className={`border-b border-border last:border-0 ${detail ? "cursor-pointer hover:bg-surface-muted/50" : ""} ${open ? "bg-surface-muted/50" : ""}`}
        onClick={detail ? (e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          setOpen((o) => !o);
        } : undefined}
        aria-expanded={detail ? open : undefined}
      >
        <td className="w-5 pl-2 text-xs text-foreground-muted" aria-hidden>
          {detail ? (open ? "▾" : "▸") : ""}
        </td>
        {cells}
      </tr>
      {open && detail && (
        <tr className="border-b border-border bg-surface-muted/30">
          <td colSpan={colSpan} className="px-3 py-2">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}
