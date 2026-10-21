// Server-side Cloudflare Turnstile check. The widget (components/turnstile.tsx) gives the browser a token; the
// server asks Cloudflare whether it is genuine before doing anything that sends email. Server only: it reads
// TURNSTILE_SECRET_KEY. Tokens work once and expire after 300 seconds.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

export type TurnstileResult = { ok: true } | { ok: false; reason: "missing" | "invalid" | "unavailable" | "not_configured"; codes?: string[] };

/** True when the form shows the widget, so the server must check its token. */
export function turnstileEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyTurnstile(token: string | undefined, remoteIp?: string): Promise<TurnstileResult> {
  // No site key: the form shows no widget (local development), so there is nothing to check.
  if (!turnstileEnabled()) return { ok: true };
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // A site key without its secret would let every request through unchecked: refuse instead.
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!token) return { ok: false, reason: "missing" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);
    const response = await fetch(SITEVERIFY, { method: "POST", body, signal: controller.signal });
    const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    return result.success ? { ok: true } : { ok: false, reason: "invalid", codes: result["error-codes"] };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
