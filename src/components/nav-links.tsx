"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/rooster", label: "Rooster", adminOnly: false },
  { href: "/rooster/mijn", label: "Mijn rooster", adminOnly: false },
  { href: "/vast-rooster", label: "Vast rooster", adminOnly: true },
  { href: "/bezetting", label: "Bezetting", adminOnly: true },
  { href: "/medewerkers", label: "Medewerkers", adminOnly: true },
  { href: "/diensten", label: "Diensten", adminOnly: true },
  { href: "/gebruikers", label: "Gebruikers", adminOnly: true },
];

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
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
            </Link>
          );
        })}
    </nav>
  );
}
