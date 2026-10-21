import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createAdminClient, getSecretKey } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { adminSecret, SESSION_COOKIE, SESSION_HOURS, sessionToken, sessionValid } from "./code";

// Who may see the admin area (D-032). Three things, all checked on the server for every page and action:
// a Supabase session (the emailed sign-in code), an active row in public.admins for that user, and the admin
// cookie (the access code), which is signed, lasts 12 hours and is tied to that user and Supabase session.

export type AdminRow = {
  id: string; email: string; name: string; user_id: string | null; status: "invited" | "active" | "disabled";
  code_hash: string; must_change_code: boolean; timezone: string;
};

export type AdminActor = { id: string; adminId: string; name: string; email: string; timezone: string };

/** The signed-in user, their Supabase session, and their admins row if they have one. Read once per request. */
export const adminAccount = cache(async () => {
  // Always at request time: a build without database settings must not bake in an answer for everyone.
  await connection();
  if (!getSecretKey() || !adminSecret()) return null;
  const supabase = await createClient();
  const [{ data: { user } }, { data: claims }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  if (!user) return null;
  const sessionId = typeof claims?.claims?.session_id === "string" ? claims.claims.session_id : null;
  const { data: admin } = await createAdminClient().from("admins")
    .select("id, email, name, user_id, status, code_hash, must_change_code, timezone").eq("user_id", user.id).maybeSingle<AdminRow>();
  return { userId: user.id, email: user.email ?? "", sessionId, admin: admin && admin.status !== "disabled" ? admin : null };
});

/** The admin making this request, past all three checks, or null. */
export const getAdminActor = cache(async (): Promise<AdminActor | null> => {
  const account = await adminAccount();
  if (!account?.admin || account.admin.status !== "active" || account.admin.must_change_code) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionValid(token, account.userId, account.sessionId)) return null;
  const { admin } = account;
  return { id: account.userId, adminId: admin.id, name: admin.name, email: admin.email, timezone: admin.timezone };
});

/**
 * For admin pages. Signed out: the sign-in page. An admin account without its access code yet: the sign-in
 * page's code step. Anyone else, members included: a 404, so the area doesn't reveal itself.
 */
export async function requireAdmin() {
  const actor = await getAdminActor();
  if (actor) return actor;
  const account = await adminAccount();
  if (!account || account.admin) redirect("/admin/login");
  notFound();
}

/** Starts the 12-hour admin session after the access code is accepted. */
export async function startAdminSession(userId: string, sessionId: string | null) {
  (await cookies()).set(SESSION_COOKIE, sessionToken(userId, sessionId), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/admin", maxAge: SESSION_HOURS * 3600,
  });
}

export async function endAdminSession() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/admin" });
}
