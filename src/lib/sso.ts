import { createHmac, timingSafeEqual } from "node:crypto";

// Korte, ondertekende "toegangsbewijzen" tussen de Hub en het rooster.
// Beide apps kennen dezelfde geheime sleutel (SSO_SECRET). Een bewijs is
// maar kort geldig en voor één bestemming (aud), zodat het niet misbruikt kan worden.
export type SsoAudience = "hub" | "rooster" | "overzicht";
export type SsoPayload = { aud: SsoAudience; email: string; name: string; role: string; exp: number };

export function ssoSecret(): string | null {
  const s = process.env.SSO_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signSso(p: Omit<SsoPayload, "exp">, ttlSeconds = 60): string | null {
  const secret = ssoSecret();
  if (!secret) return null;
  const body = b64(JSON.stringify({ ...p, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${body}.${mac(body, secret)}`;
}

export function verifySso(token: unknown, aud: SsoAudience): SsoPayload | null {
  const secret = ssoSecret();
  if (!secret || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SsoPayload;
    if (p.aud !== aud || typeof p.email !== "string" || !p.email || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/** Rol in het andere systeem; alleen beheerder en administratie komen door. */
export function mapRole(role: string): "ADMIN" | "ACCOUNTING" | null {
  return role === "ADMIN" || role === "ACCOUNTING" ? role : null;
}
