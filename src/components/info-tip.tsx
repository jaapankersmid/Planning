"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Klein ⓘ-knopje met uitleg in een popup. Verschijnt als je er met de muis overheen gaat, of (telefoon,
 * toetsenbord) als je erop tikt of er met Tab op komt. De popup staat "fixed", zodat hij niet wordt afgeknipt
 * door een tabel die horizontaal scrolt, en blijft binnen het scherm.
 */
export function InfoTip({ children, label = "Uitleg", className = "" }: { children: ReactNode; label?: string; className?: string }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = hover || pinned;

  function place() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(288, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
    const above = rect.bottom + 160 > window.innerHeight && rect.top > 160;
    setPos({ left, top: above ? rect.top - 6 : rect.bottom + 6, above });
  }

  useEffect(() => {
    if (!pinned) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      const target = e.target as Node | null;
      if (e.type === "pointerdown" && target && (button.current?.contains(target) || popup.current?.contains(target))) return;
      setPinned(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pinned]);

  return (
    <span className={`inline-flex align-middle ${className}`} onMouseEnter={() => { place(); setHover(true); }} onMouseLeave={() => setHover(false)}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          place();
          setPinned((p) => !p);
        }}
        onFocus={() => place()}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-foreground-muted/50 text-[10px] font-semibold leading-none text-foreground-muted hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        i
      </button>
      {open && pos && (
        <span
          ref={popup}
          id={id}
          role="tooltip"
          style={{ left: pos.left, top: pos.top, width: Math.min(288, typeof window === "undefined" ? 288 : window.innerWidth - 16) }}
          className={`fixed z-[60] rounded-md border border-border bg-surface px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-lg ${pos.above ? "-translate-y-full" : ""}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
