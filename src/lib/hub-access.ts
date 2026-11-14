import { signSso } from "@/lib/sso";

type U = { email: string; name: string | null; role: string; active: boolean; hubRole: string | null };

/** Rol van deze gebruiker in het crematorium-programma, of null = geen toegang. */
export function effectiveHubRole(u: Pick<U, "role" | "active" | "hubRole">): "ADMIN" | "ACCOUNTING" | "STAFF" | null {
  if (!u.active) return null;
  const r = u.hubRole || (u.role === "ADMIN" || u.role === "ACCOUNTING" ? u.role : null);
  return r === "ADMIN" || r === "ACCOUNTING" || r === "STAFF" ? r : null;
}

/**
 * Meldt het (nieuwe) recht aan de Hub, zodat een bestaand Hub-account direct meebeweegt of
 * wordt uitgezet. Mislukt dit (Hub niet bereikbaar), dan blijft de wijziging in het rooster staan
 * en geeft de Hub de nieuwe rol bij het eerstvolgende doorklikken niet door; daarom geven we
 * het resultaat terug zodat de beheerder het kan zien.
 */
export async function syncHubAccess(u: U): Promise<boolean> {
  const base = (process.env.HUB_INTERNAL_URL ?? process.env.HUB_URL)?.replace(/\/$/, "");
  const token = signSso({ aud: "hub-sync", email: u.email, name: u.name ?? "", role: effectiveHubRole(u) ?? "NONE" }, 30);
  if (!base || !token) return false;
  try {
    const res = await fetch(`${base}/api/sso-sync`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
