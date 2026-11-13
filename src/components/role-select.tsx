"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { setUserRole } from "@/app/(app)/gebruikers/actions";
import { ROLE_OPTIONS } from "@/lib/roles";

/** Keuzelijst voor de rol van een gebruiker; slaat meteen op. Alleen planners zien dit. */
export function RoleSelect({
  userId,
  userName,
  initialRole,
  disabled = false,
}: {
  userId: string;
  userName: string;
  initialRole: Role;
  disabled?: boolean;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Rol van ${userName}`}
        value={role}
        disabled={disabled || isPending}
        title={disabled ? "Je kunt je eigen rol niet wijzigen" : ROLE_OPTIONS.find((r) => r.value === role)?.description}
        onChange={(event) => {
          const previous = role;
          const next = event.target.value as Role;
          setRole(next);
          setError(null);
          startTransition(async () => {
            const result = await setUserRole(userId, next);
            if (result && "error" in result) {
              setRole(previous);
              setError(result.error);
            }
          });
        }}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm disabled:opacity-60"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {error && <span className="max-w-48 text-xs text-red-600">{error}</span>}
    </div>
  );
}
