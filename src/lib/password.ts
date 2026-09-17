import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Wachtwoord-hashing met Node's ingebouwde `crypto` (scrypt) — geen externe
// dependency nodig. Opslagformaat: "salt:hash", beide hex-gecodeerd.
const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const hashBuffer = Buffer.from(hash, "hex");
  const suppliedBuffer = scryptSync(password, salt, KEY_LENGTH);

  // Buffers moeten even lang zijn voor timingSafeEqual, en een verkeerd
  // wachtwoord kan (in theorie) een andere lengte hash opleveren.
  if (hashBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(hashBuffer, suppliedBuffer);
}

/** Genereert een leesbaar tijdelijk wachtwoord voor een nieuw aangemaakt account. */
export function generateTempPassword() {
  return randomBytes(9).toString("base64url");
}
