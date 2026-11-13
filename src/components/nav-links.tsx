"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "ADMIN" | "ACCOUNTING" | "EMPLOYEE";

const ALL: Role[] = ["ADMIN", "ACCOUNTING", "EMPLOYEE"];
const PERSONAL: Role[] = ["ADMIN", "EMPLOYEE"];
const HOURS_ADMIN: Role[] = ["ADMIN", "ACCOUNTING"];
const PLANNER: Role[] = ["ADMIN"];

const links: { href: string; label: string; roles: Role[] }[] = [
  { href: "/rooster", label: "Rooster", roles: ALL },
  { href: "/rooster/mijn", label: "Mijn rooster", roles: PERSONAL },
  { href: "/verlof", label: "Mijn verlof", roles: PERSONAL },
  { href: "/beschikbaarheid", label: "Beschikbaarheid", roles: PERSONAL },
  { href: "/uren", label: "Mijn uren", roles: PERSONAL },
  { href: "/uren/overzicht", label: "Uren", roles: HOURS_ADMIN },
  { href: "/verlof/overzicht", label: "Verlofoverzicht", roles: PLANNER },
  { href: "/vast-rooster", label: "Vast rooster", roles: PLANNER },
  { href: "/vakanties", label: "Vakanties", roles: PLANNER },
  { href: "/bezetting", label: "Bezetting", roles: PLANNER },
  { href: "/medewerkers", label: "Medewerkers", roles: PLANNER },
  { href: "/diensten", label: "Diensten", roles: PLANNER },
  { href: "/gebruikers", label: "Gebruikers", roles: PLANNER },
];

export function NavLinks({
  role,
  pendingLeave = 0,
  className = "",
}: {
  role: Role;
  pendingLeave?: number;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    // Op een telefoon één rij die zijwaarts schuift, zodat het menu niet de helft van het scherm opeet.
    <nav className={`flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-sm sm:flex-wrap sm:overflow-visible sm:pb-0 ${className}`}>
      {links
        .filter((l) => l.roles.includes(role))
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
