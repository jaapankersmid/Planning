"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Role = "ADMIN" | "ACCOUNTING" | "EMPLOYEE";

const ALL: Role[] = ["ADMIN", "ACCOUNTING", "EMPLOYEE"];
const PERSONAL: Role[] = ["ADMIN", "ACCOUNTING", "EMPLOYEE"];
const HOURS_ADMIN: Role[] = ["ADMIN", "ACCOUNTING"];
const PLANNER: Role[] = ["ADMIN"];

type Item = { href: string; label: string; roles: Role[]; personal?: boolean; /** Alleen tonen als de eigenaar is ingelogd (planvoorstel). */ owner?: boolean };

const links: Item[] = [
  { href: "/rooster", label: "Rooster", roles: ALL },
  { href: "/rooster/mijn", label: "Mijn rooster", roles: PERSONAL, personal: true },
  { href: "/verlof", label: "Mijn verlof", roles: PERSONAL, personal: true },
  { href: "/uren", label: "Mijn uren", roles: PERSONAL, personal: true },
];

/** Uitklapmenu's: Planner (planning en verlof), Administratie (uren) en Instellingen (beheer). */
const groups: { label: string; items: Item[] }[] = [
  {
    label: "Planner",
    items: [
      { href: "/verlof/overzicht", label: "Verlofoverzicht", roles: PLANNER },
      { href: "/vast-rooster", label: "Vast rooster", roles: PLANNER },
      { href: "/vakanties", label: "Vakanties", roles: PLANNER },
      { href: "/bezetting", label: "Bezetting", roles: PLANNER },
      { href: "/planvoorstel", label: "Planvoorstel", roles: PLANNER, owner: true },
    ],
  },
  {
    label: "Administratie",
    items: [
      { href: "/uren/overzicht", label: "Uren", roles: HOURS_ADMIN },
      { href: "/verlofuren", label: "Verlofuren", roles: HOURS_ADMIN },
      { href: "/ziekte", label: "Ziekte", roles: HOURS_ADMIN },
    ],
  },
  {
    label: "Instellingen",
    items: [
      { href: "/medewerkers", label: "Medewerkers", roles: PLANNER },
      { href: "/diensten", label: "Diensten", roles: PLANNER },
      { href: "/gebruikers", label: "Gebruikers", roles: PLANNER },
      { href: "/instellingen", label: "Instellingen", roles: PLANNER },
    ],
  },
];

const cls = (active: boolean) =>
  `rounded-md px-3 py-1.5 font-medium transition-colors ${active ? "bg-accent-soft text-accent" : "text-foreground-muted hover:bg-surface-muted"}`;

const Badge = ({ n }: { n: number }) => (
  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{n}</span>
);

function Group({ label, items, pathname, pendingLeave }: { label: string; items: Item[]; pathname: string; pendingLeave: number }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const away = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);
  const active = items.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));
  const badge = items.some((l) => l.href === "/verlof/overzicht") ? pendingLeave : 0;
  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.min(r.left, Math.max(8, window.innerWidth - 200)) });
    setOpen((o) => !o);
  };
  return (
    <div ref={box} className="shrink-0">
      <button ref={btn} type="button" onClick={toggle} aria-expanded={open} className={`${cls(active)} flex items-center gap-1`}>
        {label}
        {badge > 0 && <Badge n={badge} />}
        <span aria-hidden className="text-[10px]">▾</span>
      </button>
      {open && (
        // `fixed`, zodat het menu niet wordt afgeknipt door de zijwaarts schuivende menubalk op een telefoon.
        <div style={{ top: pos.top, left: pos.left }} className="fixed z-50 flex min-w-44 flex-col rounded-md border border-border bg-surface p-1 shadow-lg">
          {items.map((l) => {
            const a = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`rounded px-3 py-1.5 text-sm font-medium ${a ? "bg-accent-soft text-accent" : "text-foreground hover:bg-surface-muted"}`}>
                {l.label}
                {l.href === "/verlof/overzicht" && pendingLeave > 0 && <Badge n={pendingLeave} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NavLinks({
  role,
  pendingLeave = 0,
  hasEmployee = true,
  showAutoPlan = false,
  className = "",
}: {
  role: Role;
  /** Is de gebruiker gekoppeld aan een medewerker in het rooster? Zo niet, dan vervallen de persoonlijke items. */
  hasEmployee?: boolean;
  /** Alleen waar voor de eigenaar: toont het menu-item Planvoorstel. */
  showAutoPlan?: boolean;
  pendingLeave?: number;
  className?: string;
}) {
  const pathname = usePathname();
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((l) => l.roles.includes(role) && (!l.owner || showAutoPlan)) }))
    .filter((g) => g.items.length > 0);

  return (
    // Op een telefoon één rij die zijwaarts schuift, zodat het menu niet de helft van het scherm opeet.
    <nav className={`flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-sm sm:flex-wrap sm:overflow-visible sm:pb-0 ${className}`}>
      {links
        .filter((l) => l.roles.includes(role) && (!l.personal || hasEmployee))
        .map((l) => (
          <Link key={l.href} href={l.href} className={`${cls(pathname === l.href)} shrink-0`}>
            {l.label}
          </Link>
        ))}
      {shown.map((g) => (
        <Group key={g.label} label={g.label} items={g.items} pathname={pathname} pendingLeave={pendingLeave} />
      ))}
    </nav>
  );
}
