"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scrollcontainer met een horizontale schuifbalk boven én onder. De
 * bovenste balk verschijnt alleen als de inhoud breder is dan het scherm.
 */
export function DualScroll({ children }: { children: React.ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

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
  }, []);

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

  return (
    <div className="rounded-lg border border-border bg-surface">
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
      >
        {children}
      </div>
    </div>
  );
}
