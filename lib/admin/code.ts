import { createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { CODE_MIN, codeProblem } from "./code-rules";

export { CODE_MAX, CODE_MIN, codeProblem } from "./code-rules";

// Admin access codes and the admin session (D-032), server only.
// A code is 8 to 32 digits. Only a hash is stored: scrypt over HMAC-SHA256(code) keyed with ADMIN_SECRET, so a
// leaked admins table can't be brute-forced without the server's secret too. After the emailed sign-in code and
// the access code, the admin gets a signed cookie for 12 hours, tied to their user and Supabase session.

export const SESSION_HOURS = 12;
export const SESSION_COOKIE = "px_admin";

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** ADMIN_SECRET, at least 32 characters, or null when it isn't set: the admin area then stays closed. */
export function adminSecret() {
  const value = process.env.ADMIN_SECRET ?? "";
  return value.length >= 32 ? value : null;
}

function key(purpose: "code" | "session", secret = adminSecret()) {
  if (!secret) throw new Error("ADMIN_SECRET is not set (32 characters or more).");
  return createHmac("sha256", secret).update(`poxeet-admin-${purpose}`).digest();
}

/** A random 8-digit starting code for an invite or a reset, which the admin replaces at sign-in. */
export function newStartingCode() {
  let code = "";
  do code = Array.from({ length: CODE_MIN }, () => String(randomInt(10))).join("");
  while (codeProblem(code));
  return code;
}

const scrypt = (input: Buffer, salt: Buffer, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCallback(input, salt, 32, options, (error, derived) => (error ? reject(error) : resolve(derived))));

const pepper = (code: string, secret?: string | null) => createHmac("sha256", key("code", secret)).update(code).digest();

/** Hashes a code for the admins table: scrypt$N$r$p$salt$hash. */
export async function hashCode(code: string, secret?: string | null) {
  const salt = randomBytes(16);
  const hash = await scrypt(pepper(code, secret), salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Whether a code matches a stored hash, in constant time. A malformed hash never matches. */
export async function codeMatches(code: string, stored: string, secret?: string | null) {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash || !/^\d{1,32}$/.test(code)) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(pepper(code, secret), Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type SessionClaims = { u: string; s: string | null; e: number };

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const sign = (payload: string, secret?: string | null) => createHmac("sha256", key("session", secret)).update(payload).digest();

/** The admin cookie's value: who, which Supabase session, and until when. */
export function sessionToken(userId: string, sessionId: string | null, now = Date.now(), secret?: string | null) {
  const payload = b64(JSON.stringify({ u: userId, s: sessionId, e: now + SESSION_HOURS * 3600_000 } satisfies SessionClaims));
  return `${payload}.${b64(sign(payload, secret))}`;
}

/** Whether a cookie value is a live admin session for this user and Supabase session. */
export function sessionValid(token: string | undefined, userId: string, sessionId: string | null, now = Date.now(), secret?: string | null) {
  if (!token) return false;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return false;
  const expected = sign(payload, secret);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionClaims;
    return claims.u === userId && claims.s === sessionId && typeof claims.e === "number" && claims.e > now;
  } catch {
    return false;
  }
}
