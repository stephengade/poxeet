"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { codeMatches, codeProblem, hashCode, adminSecret } from "../../../lib/admin/code";
import { adminAccount, startAdminSession } from "../../../lib/admin/session";
import { authMessage } from "../../../lib/auth/errors";
import { emailOnlySchema, otpSchema } from "../../../lib/auth/schemas";
import { createAdminClient, getSecretKey } from "../../../lib/supabase/admin";
import { createClient } from "../../../lib/supabase/server";
import { verifyTurnstile } from "../../../lib/turnstile";

// Admin sign-in and sign-up (D-032): the emailed 6-digit code (Supabase Auth), then the admin's access code.
// Sign-up is the same steps for an invited admin, whose starting code is replaced before they get in.
// The email step answers the same way for every address, so nobody can find out which emails are admins.

type Mode = "signin" | "signup";
export type AdminAuthResult = { ok: true; mustChange?: boolean } | { ok: false; message: string; field?: "email" | "code" | "access" | "next" };

const NOT_READY: AdminAuthResult = { ok: false, message: "The admin area isn't set up on this instance yet." };
const TOO_MANY: AdminAuthResult = { ok: false, message: "Too many attempts. Wait 15 minutes, then try again." };

async function clientIp() {
  const list = await headers();
  return list.get("cf-connecting-ip") || list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
}

/** Counts attempts per key and kind in a 15-minute window (take_auth_attempt). */
async function withinLimit(key: string, kind: string, max: number) {
  const { data, error } = await createAdminClient().rpc("take_auth_attempt", { attempt_key: key, attempt_kind: kind, max_attempts: max, window_seconds: 15 * 60 });
  if (error) throw error;
  return data === true;
}

const ipKey = async () => createHash("sha256").update(await clientIp()).digest("hex");

/** Step 1: email a sign-in code, only to an admin who may use this mode. Everyone else gets the same answer. */
export async function requestAdminCode(input: { mode: Mode; email: string; captchaToken?: string }): Promise<AdminAuthResult> {
  const parsed = emailOnlySchema.safeParse({ email: input.email });
  if (!parsed.success) return { ok: false, field: "email", message: "Enter a valid email address." };
  if (!getSecretKey() || !adminSecret()) return NOT_READY;
  const [human, allowed] = await Promise.all([verifyTurnstile(input.captchaToken, await clientIp()), withinLimit(await ipKey(), "admin-request", 10)]);
  if (!human.ok) return { ok: false, message: "The security check didn't pass. Complete it again, then retry." };
  if (!allowed) return TOO_MANY;
  const email = parsed.data.email;
  const { data: admin } = await createAdminClient().from("admins").select("status, user_id").eq("email", email).maybeSingle();
  // Sign-up is for an invited admin with no account yet; sign-in for everyone else, including an invited admin who
  // verified their email but hasn't chosen their own code.
  const fits = admin && (input.mode === "signup" ? admin.status === "invited" && !admin.user_id : admin.status === "active" || (admin.status === "invited" && Boolean(admin.user_id)));
  if (fits) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: input.mode === "signup" } });
    if (error) {
      console.error("[admin] Couldn't send a sign-in code:", error.message);
      return { ok: false, message: authMessage(error, "We couldn't send the code. Try again in a minute.") };
    }
  }
  return { ok: true };
}

/** Step 2: the emailed code. Starts a Supabase session only for an admin account; anyone else is signed out again. */
export async function verifyAdminEmailCode(input: { email: string; code: string }): Promise<AdminAuthResult> {
  const parsed = emailOnlySchema.safeParse({ email: input.email });
  const otp = otpSchema.safeParse({ code: input.code });
  if (!parsed.success || !otp.success) return { ok: false, field: "code", message: "Enter the 6-digit code from the email." };
  if (!getSecretKey() || !adminSecret()) return NOT_READY;
  if (!(await withinLimit(await ipKey(), "admin-verify", 20))) return TOO_MANY;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: otp.data.code, type: "email" });
  if (error || !data.user) return { ok: false, field: "code", message: authMessage(error, "That code didn't match. Check it, or send a new one.") };

  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("id, status, user_id, must_change_code").eq("email", parsed.data.email).maybeSingle();
  const linked = admin && admin.status !== "disabled" && (admin.user_id === null || admin.user_id === data.user.id);
  if (!admin || !linked) {
    await supabase.auth.signOut();
    return { ok: false, message: "This email can't sign in to the admin area." };
  }
  if (!admin.user_id) await db.from("admins").update({ user_id: data.user.id }).eq("id", admin.id).is("user_id", null);
  return { ok: true, mustChange: admin.must_change_code };
}

/** Step 3: the access code, and a new one when the admin is still on a starting code. Starts the 12-hour admin session. */
export async function enterAccessCode(input: { code: string; newCode?: string }): Promise<AdminAuthResult> {
  const account = await adminAccount();
  if (!account?.admin) return { ok: false, message: "Your sign-in has ended. Start again." };
  const { admin } = account;
  if (!(await withinLimit(admin.id, "admin-code", 5))) return TOO_MANY;
  if (!(await codeMatches(input.code, admin.code_hash))) return { ok: false, field: "access", message: "That access code didn't match." };

  const db = createAdminClient();
  const update: Record<string, unknown> = { last_sign_in_at: new Date().toISOString() };
  let joined = false;
  if (admin.must_change_code) {
    const next = input.newCode ?? "";
    const problem = codeProblem(next);
    if (problem) return { ok: false, field: "next", message: problem };
    if (next === input.code) return { ok: false, field: "next", message: "Choose a code different from the one you were given." };
    Object.assign(update, { code_hash: await hashCode(next), must_change_code: false, code_changed_at: new Date().toISOString(), status: "active" });
    joined = admin.status === "invited";
  }
  const { error } = await db.from("admins").update(update).eq("id", admin.id);
  if (error) return { ok: false, message: "We couldn't sign you in. Try again in a moment." };
  if (admin.must_change_code) {
    await db.from("admin_audit_logs").insert({ actor_id: account.userId, action: joined ? "admin.joined" : "admin.code_changed", target_admin_id: admin.id, details: {} });
  }
  await startAdminSession(account.userId, account.sessionId);
  return { ok: true };
}
