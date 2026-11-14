/* Eenvoudige begrenzing per IP-adres voor openbare formulieren (in het geheugen; telt per serverproces). */
const hits = new Map<string, number[]>();

export function tooMany(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return false;
}

export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "onbekend";
