"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { authMessage } from "../../lib/auth/errors";
import { accessCodeSchema, emailOnlySchema, maskEmail, otpSchema, type AccessMethod } from "../../lib/auth/schemas";
import { createAdminClient, getSecretKey } from "../../lib/supabase/admin";
import { createClient } from "../../lib/supabase/server";
import { verifyTurnstile } from "../../lib/turnstile";

// Sign-in and sign-up both run here, on the server, because they read the allowlist with the secret key.
// Sign-up: each invited person may create their account by email, by access code, or both (allowlist.access_type).
// Sign-in: email only, for anyone on the allowlist who has an account. Either way the last step is a 6-digit code
// emailed to the address on the allowlist. With an access code, that address is never sent to the browser.

type Invite = {
  email: string; first_name: string | null; last_name: string | null;
  access_type: "code" | "email" | "all"; code_expires_at: string | null;
  account_exists: boolean; account_confirmed: boolean;
};
type Fail = { status: "error"; message: string };
type Intent = "signin" | "signup";

const NOT_CONFIGURED: Fail = { status: "error", message: "Sign-in isn't configured yet. Ask the app owner to finish setup." };
const TOO_MANY: Fail = { status: "error", message: "Too many attempts from this network. Wait 15 minutes, then try again." };
const INVALID_CODE = "That access code isn't valid. Check it against your invite, or ask whoever invited you.";

async function clientIp() {
  const list = await headers();
  return list.get("cf-connecting-ip") || list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
}

/** Tells the visitor setup is unfinished and tells the operator, in the server log, exactly what is missing. */
function notConfigured(detail: string): Fail {
  console.error(`[auth] Sign-in setup is incomplete: ${detail}`);
  return NOT_CONFIGURED;
}

/**
 * Counts lookups per client IP (hashed) so access codes and emails can't be guessed in bulk. `by` keys the count
 * on something else instead (an email), for limits that must hold however many addresses the caller uses.
 */
async function withinLimit(kind: string, max: number, by?: string) {
  const key = createHash("sha256").update(by ?? await clientIp()).digest("hex");
  const { data, error } = await createAdminClient().rpc("take_auth_attempt", {
    attempt_key: key, attempt_kind: kind, max_attempts: max, window_seconds: 15 * 60,
  });
  // A missing function means the migration isn't applied: fail as a setup problem, not as "too many attempts".
  if (error) throw error;
  return data === true;
}

async function findInvite(method: AccessMethod, value: string): Promise<Invite | null> {
  const args = method === "code" ? { lookup_code: value } : { lookup_email: value };
  const { data, error } = await createAdminClient().rpc("invite_lookup", args).maybeSingle<Invite>();
  if (error) throw error;
  return data ?? null;
}

/** access_type limits how an account is created. Once it exists, the person signs in with their email. */
function allows(invite: Invite, intent: Intent, method: AccessMethod) {
  if (intent === "signin") return method === "email";
  return invite.access_type === "all" || invite.access_type === method;
}

function expiredOn(invite: Invite) {
  if (!invite.code_expires_at) return null;
  const expires = new Date(invite.code_expires_at);
  return expires.getTime() <= Date.now() ? expires.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
}

/** Parses the email or access code the person typed, by method. */
function parseValue(method: AccessMethod, value: string) {
  if (method === "code") {
    const parsed = accessCodeSchema.safeParse({ accessCode: value });
    return parsed.success ? { ok: true as const, value: parsed.data.accessCode } : { ok: false as const, message: parsed.error.issues[0]?.message ?? INVALID_CODE };
  }
  const parsed = emailOnlySchema.safeParse({ email: value });
  return parsed.success ? { ok: true as const, value: parsed.data.email } : { ok: false as const, message: "Enter a valid email address." };
}

export type RequestCodeResult =
  | { status: "sent"; destination: string; firstName: string | null }
  /** The value itself is wrong: unknown or expired access code, or a malformed email. Shown under the field. */
  | { status: "field_error"; message: string }
  /**
   * By email, any reason the email can't be used here: not invited, no account yet (sign-in), account already
   * exists or the invite is code-only (sign-up). One answer for all of them, so nobody can probe which emails
   * are invited or registered.
   */
  | { status: "unavailable" }
  /** By access code, the person holds a valid code, so these are told plainly. */
  | { status: "use_email" }
  | { status: "already_registered"; maskedEmail: string }
  | Fail;

/**
 * Emails a 6-digit code. Sign-in never creates an account and sign-up never reuses one, and each person can only
 * use the methods their invite allows. Also used to resend.
 */
export async function requestCode(input: { intent: Intent; method: AccessMethod; value: string; captchaToken?: string }): Promise<RequestCodeResult> {
  if (input.intent === "signin" && input.method !== "email") return { status: "error", message: "Sign in with your email address." };
  const parsed = parseValue(input.method, input.value);
  if (!parsed.ok) return { status: "field_error", message: parsed.message };
  if (!getSecretKey()) return notConfigured("SUPABASE_SECRET_KEY is not set.");
  // Three independent round trips, run together. Turnstile is checked here with Cloudflare, before any email
  // goes out; the lookup's answer is ignored when the check or the limit fails.
  const [human, allowed, invite] = await Promise.all([
    verifyTurnstile(input.captchaToken, await clientIp()),
    withinLimit(`request-${input.method}`, input.method === "code" ? 10 : 20),
    findInvite(input.method, parsed.value),
  ]);
  if (!human.ok) {
    if (human.reason === "not_configured") return notConfigured("NEXT_PUBLIC_TURNSTILE_SITE_KEY is set but TURNSTILE_SECRET_KEY is not.");
    if (human.reason === "unavailable") return { status: "error", message: "We couldn't run the security check. Try again in a moment." };
    return { status: "error", message: "The security check didn't pass. Complete it again, then retry." };
  }
  if (!allowed) return TOO_MANY;
  if (input.method === "email") {
    const hasAccount = invite?.account_confirmed === true;
    if (!invite || !allows(invite, input.intent, "email") || hasAccount !== (input.intent === "signin")) return { status: "unavailable" };
  } else {
    if (!invite) return { status: "field_error", message: INVALID_CODE };
    if (expiredOn(invite)) return { status: "field_error", message: "This access code has expired. Ask whoever invited you for a new one." };
    if (!allows(invite, input.intent, "code")) return { status: "use_email" };
    if (invite.account_confirmed) return { status: "already_registered", maskedEmail: maskEmail(invite.email) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: invite.email,
    options: { shouldCreateUser: input.intent === "signup" },
  });
  if (error) return { status: "error", message: authMessage(error, "We couldn't send your code. Try again in a minute.") };
  return {
    status: "sent",
    destination: input.method === "code" ? maskEmail(invite.email) : invite.email,
    firstName: invite.first_name,
  };
}

export type VerifyResult = { status: "ok"; next: string } | { status: "wrong_code"; message: string } | { status: "suspended" } | Fail;

/** Verifies the emailed 6-digit code and starts the session on the server. */
export async function verifyCode(input: { intent: Intent; method: AccessMethod; value: string; code: string }): Promise<VerifyResult> {
  const parsed = parseValue(input.method, input.value);
  const otp = otpSchema.safeParse({ code: input.code });
  if (!otp.success) return { status: "wrong_code", message: "Enter the 6-digit code from the email." };
  if (!parsed.ok) return { status: "error", message: parsed.message };
  if (!getSecretKey()) return notConfigured("SUPABASE_SECRET_KEY is not set.");
  const [allowed, invite] = await Promise.all([withinLimit("verify", 20), findInvite(input.method, parsed.value)]);
  if (!allowed) return TOO_MANY;
  if (!invite || !allows(invite, input.intent, input.method)) return { status: "error", message: "This invite no longer works. Ask whoever invited you." };
  // The IP limit trusts forwarded headers, which a client can vary, so codes for one address are capped too.
  if (!(await withinLimit("verify-email", 10, `email:${invite.email}`))) return TOO_MANY;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: invite.email, token: otp.data.code, type: "email" });
  if (error) return { status: "wrong_code", message: authMessage(error, "That code didn't match. Check it, or send a new one.") };

  const { data: active } = await supabase.rpc("is_active_member");
  if (active !== true) {
    await supabase.auth.signOut();
    return { status: "suspended" };
  }
  if (input.method === "code") {
    await createAdminClient().from("allowlist").update({ redeemed_at: new Date().toISOString() }).eq("email", invite.email).is("redeemed_at", null);
  }
  // proxy.ts sends anyone who hasn't finished onboarding there first.
  return { status: "ok", next: "/app" };
}
