// Supabase Auth errors in plain words. Codes come from GoTrue; messages are matched only as a fallback
// for older servers that return no code.

type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

export const INVITE_ONLY = "Poxeet is invite-only. Use the access code from your invite.";

export function isRateLimited(error: AuthErrorLike) {
  return error?.status === 429 || Boolean(error?.code?.startsWith("over_"));
}

export function isCaptchaFailed(error: AuthErrorLike) {
  return error?.code === "captcha_failed" || /captcha/i.test(error?.message ?? "");
}

export function authMessage(error: AuthErrorLike, fallback: string) {
  if (!error) return fallback;
  if (error.message?.includes("invitation")) return INVITE_ONLY;
  if (isRateLimited(error)) return "Too many attempts. Wait a minute, then try again.";
  if (isCaptchaFailed(error)) return "The security check expired. Complete it again, then retry.";
  if (error.code === "otp_expired") return "That code has expired or was already used. Request a new one.";
  return fallback;
}
