"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];
const STORAGE_KEY = "rooster-zoom";

function nearestStep(value: number) {
  return STEPS.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best));
}

/**
 * Scrollcontainer met een horizontale schuifbalk boven én onder, plus knoppen
 * om in en uit te zoomen (naast knijpen met twee vingers). De bovenste balk
 * verschijnt alleen als de inhoud breder is dan het scherm.
 */
export function DualScroll({ children }: { children: React.ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Zoomniveau onthouden; op een smal scherm de eerste keer meteen "passend" maken.
  useEffect(() => {
    let saved: number | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      saved = raw ? Number(raw) : null;
    } catch {
      saved = null;
    }
    if (saved && STEPS.includes(saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- opgeslagen voorkeur pas na het laden toepassen (voorkomt een verschil met de serverweergave)
      setZoom(saved);
    } else if (window.innerWidth < 640) {
      requestAnimationFrame(() => fit());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyZoom(value: number) {
    setZoom(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Opslaan mag mislukken (bv. privévenster); het zoomen zelf werkt dan nog.
    }
  }

  function step(direction: 1 | -1) {
    const index = STEPS.indexOf(nearestStep(zoom));
    const next = STEPS[Math.min(STEPS.length - 1, Math.max(0, index + direction))];
    applyZoom(next);
  }

  /** Kies het grootste zoomniveau waarbij het hele rooster net in beeld past. */
  function fit() {
    const bottom = bottomRef.current;
    if (!bottom) return;
    const naturalWidth = bottom.scrollWidth / (zoomRef.current || 1);
    const target = bottom.clientWidth / naturalWidth;
    const fitting = [...STEPS].reverse().find((s) => s <= target) ?? STEPS[0];
    applyZoom(Math.min(fitting, 1));
  }
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const bottom = bottomRef.current;
    if (!bottom) return;
    const measure = () => {
      setContentWidth(bottom.scrollWidth);
      setOverflowing(bottom.scrollWidth > bottom.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bottom);
    if (bottom.firstElementChild) observer.observe(bottom.firstElementChild);
    return () => observer.disconnect();
  }, [zoom]);

  // Houd beide balken gelijk; de vlag voorkomt dat ze elkaar blijven aanstoten.
  const syncing = useRef(false);
  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  const buttonClass =
    "flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-surface px-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-40";

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-end gap-1.5 border-b border-border px-2 py-1.5">
        <span className="mr-1 text-xs text-foreground-muted">Zoom</span>
        <button
          type="button"
          className={buttonClass}
          onClick={() => step(-1)}
          disabled={zoom <= STEPS[0]}
          aria-label="Uitzoomen"
        >
          −
        </button>
        <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className={buttonClass}
          onClick={() => step(1)}
          disabled={zoom >= STEPS[STEPS.length - 1]}
          aria-label="Inzoomen"
        >
          +
        </button>
        <button type="button" className={`${buttonClass} text-xs`} onClick={fit}>
          Passend
        </button>
        <button type="button" className={`${buttonClass} text-xs`} onClick={() => applyZoom(1)}>
          100%
        </button>
      </div>
      <div
        ref={topRef}
        onScroll={() => sync(topRef.current, bottomRef.current)}
        className={`overflow-x-auto overflow-y-hidden border-b border-border ${
          overflowing ? "" : "hidden"
        }`}
        aria-hidden="true"
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
      <div
        ref={bottomRef}
        onScroll={() => sync(bottomRef.current, topRef.current)}
        className="overflow-x-auto"
        style={{ touchAction: "pan-x pan-y pinch-zoom" }}
      >
        <div style={{ zoom }}>{children}</div>
      </div>
    </div>
  );
}
