"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/rooster", label: "Rooster", adminOnly: false },
  { href: "/rooster/mijn", label: "Mijn rooster", adminOnly: false },
  { href: "/verlof", label: "Mijn verlof", adminOnly: false },
  { href: "/beschikbaarheid", label: "Beschikbaarheid", adminOnly: false },
  { href: "/verlof/overzicht", label: "Verlofoverzicht", adminOnly: true },
  { href: "/vast-rooster", label: "Vast rooster", adminOnly: true },
  { href: "/vakanties", label: "Vakanties", adminOnly: true },
  { href: "/bezetting", label: "Bezetting", adminOnly: true },
  { href: "/medewerkers", label: "Medewerkers", adminOnly: true },
  { href: "/diensten", label: "Diensten", adminOnly: true },
  { href: "/gebruikers", label: "Gebruikers", adminOnly: true },
];

export function NavLinks({
  isAdmin,
  pendingLeave = 0,
  className = "",
}: {
  isAdmin: boolean;
  pendingLeave?: number;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    // Op een telefoon één rij die zijwaarts schuift, zodat het menu niet de helft van het scherm opeet.
    <nav className={`flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-sm sm:flex-wrap sm:overflow-visible sm:pb-0 ${className}`}>
      {links
        .filter((l) => !l.adminOnly || isAdmin)
        .map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {l.label}
              {l.href === "/verlof/overzicht" && pendingLeave > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {pendingLeave}
                </span>
              )}
            </Link>
          );
        })}
    </nav>
  );
}
