import { createHash, timingSafeEqual } from "node:crypto";

// The cron routes are the only part of Poxeet that acts with no member present, so each one checks
// `Authorization: Bearer <CRON_SECRET>` in constant time (PRD section 13). Without CRON_SECRET they refuse all calls.

const digest = (value: string) => createHash("sha256").update(value).digest();

export function cronAuthorized(header: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 16 || !header) return false;
  const token = header.replace(/^Bearer\s+/i, "");
  // Hashing first makes both sides the same length, so the comparison never leaks the secret's length.
  return timingSafeEqual(digest(token), digest(secret));
}
