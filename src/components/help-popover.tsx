"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
/** Het uitklapbare deel van het ?-knopje (zie HelpButton). */
export function HelpPopover({ t }: { t: { id: string; title: string; summary: string } }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Uitleg: ${t.title}`}
        className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground-muted hover:bg-surface-muted"
      >
        ?
      </button>
      {open && (
        <span
          role="dialog"
          aria-label={t.title}
          className="absolute left-0 top-7 z-40 block w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 text-left text-sm font-normal text-foreground shadow-lg"
        >
          <span className="block font-semibold">{t.title}</span>
          <span className="mt-1 block text-foreground-muted">{t.summary}</span>
          <Link href={`/hulp#${t.id}`} onClick={() => setOpen(false)} className="mt-2 inline-block text-xs underline hover:no-underline">
            Lees de hele uitleg →
          </Link>
        </span>
      )}
    </span>
  );
}
