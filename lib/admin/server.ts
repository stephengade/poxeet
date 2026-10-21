import { creditsModel } from "../ai/server";
import { billingEnabled, creditExpiry, CREDITS_PER_DOLLAR } from "../billing/config";
import { costShare, isLowBalance, margin } from "../billing/rates";
import { email as mail } from "../email";
import { createAdminClient } from "../supabase/admin";
import { randomUUID } from "node:crypto";
import { codeMatches, codeProblem, hashCode } from "./code";
import { byCurrency } from "./format";
import { aiSourceOf, checkAdminChange, checkMemberChange, describeAudit, expiryFrom, inviteState, newAccessCode } from "./rules";
import type { AdminActor } from "./session";
import type {
  AdminAuditEntry, AdminEarnings, AdminInvite, AdminMember, AdminOverview, AdminPerson, AdminPurchase, AdminResult, InviteInput, MemberChange, PurchaseStatus,
} from "./types";

// The admin area's data and changes (PRD ADM-1, D-031, D-032). Callers have already passed requireAdmin or
// getAdminActor (lib/admin/session.ts); everything here runs with the service role. Reads are counts, money and
// settings only. Every change writes one admin_audit_logs entry per thing it changed.

export type { AdminActor } from "./session";
export { getAdminActor, requireAdmin } from "./session";

type Db = ReturnType<typeof createAdminClient>;

const nameOf = (row: { first_name?: string | null; last_name?: string | null; display_name?: string | null; email: string }) =>
  [row.first_name, row.last_name].filter(Boolean).join(" ") || row.display_name || row.email.split("@")[0];

/** The time a page renders with, so "Today" reads the same on the server and in the browser. */
export function requestTime() {
  return Date.now();
}

type AuditTarget = { user?: string | null; admin?: string | null };

async function audit(db: Db, actorId: string, action: string, target: AuditTarget, details: Record<string, unknown>) {
  const { error } = await db.from("admin_audit_logs").insert({
    actor_id: actorId, action, target_user_id: target.user ?? null, target_admin_id: target.admin ?? null, details,
  });
  if (error) console.error("[admin] Couldn't write the audit log:", error.message);
}

// ---------- Reads ----------

type MemberRow = {
  id: string; email: string; first_name: string | null; last_name: string | null; display_name: string | null; role: string;
  account_status: string; master_key_access: string; daily_generation_cap: number; created_at: string; has_own_key: boolean;
  credits: number; used_today: number; calls_7d: number; last_job_at: string | null; published_30d: number;
};

export async function loadMembers(): Promise<AdminMember[]> {
  const { data, error } = await createAdminClient().rpc("admin_members");
  if (error) throw new Error(`Couldn't read members: ${error.message}`);
  const billing = billingEnabled();
  return ((data ?? []) as MemberRow[]).map((row) => {
    const credits = billing ? Number(row.credits ?? 0) : null;
    const ai = aiSourceOf({ has_own_key: row.has_own_key, master_key_access: row.master_key_access, credits });
    return {
      id: row.id, name: nameOf(row), email: row.email,
      status: row.account_status === "suspended" ? "suspended" : "active", ai, instanceKey: row.master_key_access === "granted",
      usedToday: row.used_today, cap: row.daily_generation_cap, credits, creditsLow: credits !== null && ai === "credits" && isLowBalance(credits),
      joined: row.created_at, lastJob: row.last_job_at, calls7d: row.calls_7d, published30d: row.published_30d,
    };
  });
}

export async function loadAccess(): Promise<{ invites: AdminInvite[]; signupMode: "open" | "invite_only" }> {
  const db = createAdminClient();
  const [{ data: rows, error }, { data: profiles }, { data: settings }] = await Promise.all([
    db.from("allowlist").select("email, first_name, last_name, master_key_access, access_type, access_code, access_code_expires_at, created_at").order("created_at", { ascending: false }),
    db.from("profiles").select("email"),
    db.from("instance_settings").select("signup_mode").maybeSingle(),
  ]);
  if (error) throw new Error(`Couldn't read the access list: ${error.message}`);
  const joined = new Set((profiles ?? []).map((row) => row.email.toLowerCase()));
  const invites = (rows ?? []).map((row) => ({
    email: row.email, name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email.split("@")[0],
    how: row.access_type, code: row.access_code, expires: row.access_code_expires_at,
    state: inviteState(row, joined.has(row.email)), instanceKey: row.master_key_access === "granted",
  } satisfies AdminInvite));
  return { invites, signupMode: settings?.signup_mode === "invite_only" ? "invite_only" : "open" };
}

export async function loadAudit(limit = 200): Promise<AdminAuditEntry[]> {
  const db = createAdminClient();
  const { data: rows, error } = await db.from("admin_audit_logs").select("id, actor_id, action, target_user_id, target_admin_id, details, created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Couldn't read the audit log: ${error.message}`);
  const userIds = [...new Set((rows ?? []).flatMap((row) => [row.actor_id, row.target_user_id]).filter((id): id is string => Boolean(id)))];
  const [{ data: people }, { data: admins }] = await Promise.all([
    userIds.length ? db.from("profiles").select("id, email, first_name, last_name, display_name").in("id", userIds) : Promise.resolve({ data: [] }),
    db.from("admins").select("id, user_id, name"),
  ]);
  // Actors are admins, who have no profile; targets are members or admins.
  const names = new Map<string, string>((people ?? []).map((person) => [person.id, nameOf(person)]));
  for (const admin of admins ?? []) if (admin.user_id) names.set(admin.user_id, admin.name);
  const adminNames = new Map((admins ?? []).map((admin) => [admin.id, admin.name]));
  return (rows ?? []).map((row) => {
    const details = (row.details ?? {}) as Record<string, unknown>;
    // Invites have no account yet: the entry carries the name or email it was about.
    const target = (row.target_admin_id && adminNames.get(row.target_admin_id)) || (row.target_user_id && names.get(row.target_user_id))
      || String(details.name ?? details.email ?? "someone since removed");
    return {
      id: String(row.id), at: row.created_at, actor: (row.actor_id && names.get(row.actor_id)) || "A removed admin",
      targetId: row.target_user_id, ...describeAudit(row.action, details, target),
    };
  });
}

const DAY = 24 * 60 * 60 * 1000;

export async function loadEarnings(days = 30): Promise<AdminEarnings> {
  const db = createAdminClient();
  const since = new Date(Date.now() - days * DAY).toISOString();
  const [{ data: rows, error }, { data: totals }] = await Promise.all([
    db.from("checkout_sessions")
      .select("id, user_id, credits, amount, currency, status, created_at, paid_at, refunded_amount, refund_shortfall, credit_packs(name), profiles(email, first_name, last_name, display_name)")
      .gte("created_at", since).order("created_at", { ascending: false }),
    db.rpc("admin_credit_totals", { p_since: since }).maybeSingle<{ used: number; granted: number }>(),
  ]);
  if (error) throw new Error(`Couldn't read purchases: ${error.message}`);
  const purchases = (rows ?? []).map((row) => {
    const pack = (Array.isArray(row.credit_packs) ? row.credit_packs[0] : row.credit_packs) as { name: string } | null;
    const person = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { email: string; first_name: string | null; last_name: string | null; display_name: string | null } | null;
    return {
      id: row.id, memberId: row.user_id, name: person ? nameOf(person) : "A deleted member", email: person?.email ?? "",
      at: row.paid_at ?? row.created_at, pack: pack?.name ?? "Pack", credits: row.credits, amount: Number(row.amount), currency: row.currency,
      status: row.status as PurchaseStatus, refunded: Number(row.refunded_amount ?? 0), shortfall: row.refund_shortfall ?? 0,
    } satisfies AdminPurchase;
  });
  return { purchases, creditsUsed: totals?.used ?? 0, creditsGranted: totals?.granted ?? 0, creditsPerCostDollar: (margin() * CREDITS_PER_DOLLAR) / costShare(creditsModel()) };
}

const SETTLED: PurchaseStatus[] = ["paid", "refunded", "partially_refunded"];

export async function loadOverview(): Promise<AdminOverview> {
  const [members, { invites }, audit, calls, earnings] = await Promise.all([
    loadMembers(), loadAccess(), loadAudit(4),
    createAdminClient().rpc("admin_instance_calls", { p_days: 14 }),
    billingEnabled() ? loadEarnings(30) : Promise.resolve(null),
  ]);
  if (calls.error) throw new Error(`Couldn't read usage: ${calls.error.message}`);
  const paid = earnings?.purchases.filter((purchase) => SETTLED.includes(purchase.status)) ?? [];
  return {
    now: Date.now(), members, invites, audit,
    callsByDay: ((calls.data ?? []) as Array<{ day: string; calls: number }>).map((row) => ({ day: row.day, calls: row.calls })),
    earnings: earnings && {
      net: byCurrency(paid, (row) => row.currency, (row) => row.amount - row.refunded),
      refunded: byCurrency(paid.filter((row) => row.refunded > 0), (row) => row.currency, (row) => row.refunded),
      purchases: paid.length,
    },
  };
}

// ---------- Changes ----------

const FAILED: AdminResult = { ok: false, message: "That didn't save. Try again in a moment." };

export async function updateMember(actor: AdminActor, id: string, change: MemberChange): Promise<AdminResult> {
  const problem = checkMemberChange(change);
  if (problem) return { ok: false, message: problem };
  const db = createAdminClient();
  const { data: target } = await db.from("profiles").select("id, email, account_status, master_key_access, daily_generation_cap").eq("id", id).maybeSingle();
  if (!target) return { ok: false, message: "That member no longer exists." };

  const fields: Record<string, unknown> = {};
  const entries: Array<[string, Record<string, unknown>]> = [];
  if (change.instanceKey !== undefined && (target.master_key_access === "granted") !== change.instanceKey) {
    fields.master_key_access = change.instanceKey ? "granted" : "none";
    entries.push(["member.instance_key", { granted: change.instanceKey }]);
  }
  if (change.cap !== undefined && change.cap !== target.daily_generation_cap) {
    fields.daily_generation_cap = change.cap;
    entries.push(["member.cap", { from: target.daily_generation_cap, to: change.cap }]);
  }
  if (change.suspended !== undefined && (target.account_status === "suspended") !== change.suspended) {
    fields.account_status = change.suspended ? "suspended" : "active";
    entries.push([change.suspended ? "member.suspend" : "member.reinstate", {}]);
  }
  if (!entries.length) return { ok: true, message: "Nothing to change." };

  const { error } = await db.from("profiles").update(fields).eq("id", id);
  if (error) {
    console.error("[admin] Couldn't update a member:", error.message);
    return FAILED;
  }
  // Keep the access list in step, so a re-created account comes back with the same grant.
  if ("master_key_access" in fields) await db.from("allowlist").update({ master_key_access: fields.master_key_access }).eq("email", target.email);
  for (const [action, details] of entries) await audit(db, actor.id, action, { user: id }, details);
  return { ok: true };
}

export async function grantCredits(actor: AdminActor, id: string, amount: number, note: string): Promise<AdminResult> {
  if (!billingEnabled()) return { ok: false, message: "Billing is off on this instance, so there are no credits to grant." };
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return { ok: false, message: "Enter a whole number of credits, not zero." };
  const db = createAdminClient();
  if (amount < 0) {
    const { data: balance } = await db.rpc("current_credits", { p_user: id });
    if (Number(balance ?? 0) + amount < 0) return { ok: false, message: `They have ${Number(balance ?? 0).toLocaleString("en-US")} credits; you can't take more than that.` };
  }
  const reference = `admin:${randomUUID()}`;
  const { error } = await db.rpc("grant_credits", {
    p_user: id, p_amount: amount, p_reference: reference, p_note: note.trim().slice(0, 200) || null,
    p_expires_at: amount > 0 ? creditExpiry().toISOString() : null,
  });
  if (error) {
    console.error("[admin] Couldn't grant credits:", error.message);
    return FAILED;
  }
  await audit(db, actor.id, "credits.grant", { user: id }, { amount, note: note.trim().slice(0, 200) || null, reference });
  return { ok: true };
}

export async function setSignupMode(actor: AdminActor, mode: "open" | "invite_only"): Promise<AdminResult> {
  const db = createAdminClient();
  const { data: current } = await db.from("instance_settings").select("signup_mode").maybeSingle();
  if (current?.signup_mode === mode) return { ok: true };
  const { error } = await db.from("instance_settings").update({ signup_mode: mode, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return FAILED;
  await audit(db, actor.id, "signup.mode", {}, { from: current?.signup_mode ?? null, to: mode });
  return { ok: true };
}

async function sendInviteEmail(row: { email: string; first_name: string; last_name: string; access_type: InviteInput["how"]; access_code: string | null; access_code_expires_at: string | null }) {
  const result = await mail.sendSingle({
    to: { email: row.email, name: `${row.first_name} ${row.last_name}`.trim() },
    template: "invite",
    data: { firstName: row.first_name, accessType: row.access_type, accessCode: row.access_code, codeExpiresAt: row.access_code_expires_at, email: row.email },
  });
  if (!result.ok) console.error("[admin] Invite email failed:", result.error);
  return result.ok;
}

export async function invite(actor: AdminActor, input: InviteInput): Promise<AdminResult & { code?: string | null }> {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) return { ok: false, message: "Enter their first name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (!["all", "code", "email"].includes(input.how)) return { ok: false, message: "Choose how they can join." };
  const usesCode = input.how !== "email";
  const expires = usesCode ? expiryFrom(input.expiry) : null;
  if (expires === undefined) return { ok: false, message: "Choose how long the code works." };

  const db = createAdminClient();
  const [{ data: existing }, { data: admin }] = await Promise.all([
    db.from("profiles").select("id").eq("email", email).maybeSingle(),
    db.from("admins").select("id").eq("email", email).maybeSingle(),
  ]);
  if (existing) return { ok: false, message: "They already have an account. Find them under Members." };
  if (admin) return { ok: false, message: "That email is an admin account. Admins can't also be members; use another email." };
  const row = {
    email, first_name: firstName, last_name: lastName, access_type: input.how,
    access_code: usesCode ? newAccessCode() : null, access_code_expires_at: expires?.toISOString() ?? null,
    role: "member", master_key_access: input.instanceKey ? "granted" : "none", invited_by: actor.id,
  };
  const { error } = await db.from("allowlist").upsert(row, { onConflict: "email" });
  if (error) {
    console.error("[admin] Couldn't save an invite:", error.message);
    return FAILED;
  }
  const sent = input.send ? await sendInviteEmail(row) : false;
  await audit(db, actor.id, "invite.add", {}, { email, name: `${firstName} ${lastName}`.trim(), how: input.how, instanceKey: input.instanceKey, sent });
  if (input.send && !sent) return { ok: true, code: row.access_code, message: "Saved, but the email didn't send. Copy the code from the list and share it yourself." };
  return { ok: true, code: row.access_code };
}

export async function newCode(actor: AdminActor, email: string): Promise<AdminResult & { code?: string }> {
  const db = createAdminClient();
  const { data: row } = await db.from("allowlist").select("email, first_name, last_name, access_type").eq("email", email).maybeSingle();
  if (!row) return { ok: false, message: "They're no longer on the access list." };
  const code = newAccessCode();
  const expires = expiryFrom("30d")!;
  // An email-only invite that gets a code can now join either way.
  const { error } = await db.from("allowlist").update({ access_code: code, access_code_expires_at: expires.toISOString(), access_type: row.access_type === "email" ? "all" : row.access_type }).eq("email", email);
  if (error) return FAILED;
  await audit(db, actor.id, "invite.code", {}, { email, name: [row.first_name, row.last_name].filter(Boolean).join(" ") || email, expires: expires.toISOString() });
  return { ok: true, code };
}

export async function removeInvite(actor: AdminActor, email: string): Promise<AdminResult> {
  const db = createAdminClient();
  const [{ data: row }, { data: account }] = await Promise.all([
    db.from("allowlist").select("first_name, last_name").eq("email", email).maybeSingle(),
    db.from("profiles").select("id").eq("email", email).maybeSingle(),
  ]);
  if (!row) return { ok: true };
  // With invite-only sign-up the list also lets people sign in, so someone with an account stays on it.
  if (account) return { ok: false, message: "They already joined. Suspend them under Members instead." };
  const { error } = await db.from("allowlist").delete().eq("email", email);
  if (error) return FAILED;
  await audit(db, actor.id, "invite.remove", {}, { email, name: [row.first_name, row.last_name].filter(Boolean).join(" ") || email });
  return { ok: true };
}

// ---------- Admins (D-032) ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function loadAdmins(actor: AdminActor): Promise<AdminPerson[]> {
  const { data, error } = await createAdminClient().from("admins")
    .select("id, name, email, status, invited_by, last_sign_in_at, created_at, must_change_code").order("created_at");
  if (error) throw new Error(`Couldn't read admins: ${error.message}`);
  const names = new Map((data ?? []).map((row) => [row.id, row.name]));
  return (data ?? []).map((row) => ({
    id: row.id, name: row.name, email: row.email, status: row.status, you: row.id === actor.adminId,
    invitedBy: row.invited_by ? names.get(row.invited_by) ?? null : null, lastSignIn: row.last_sign_in_at, created: row.created_at,
    mustChangeCode: row.must_change_code,
  }));
}

/** Adds an admin with a starting code the inviter chose. They sign up at /admin/signup and replace it. */
export async function inviteAdmin(actor: AdminActor, input: { name: string; email: string; code: string }): Promise<AdminResult> {
  const name = input.name.trim().slice(0, 80);
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, message: "Enter their name." };
  if (!EMAIL.test(email)) return { ok: false, message: "Enter a valid email address." };
  const problem = codeProblem(input.code);
  if (problem) return { ok: false, message: `Starting code: ${problem}` };
  const db = createAdminClient();
  // Admin accounts are admin only, so the email must not already belong to a member or a member invite.
  const [{ data: admin }, { data: member }, { data: listed }] = await Promise.all([
    db.from("admins").select("id").eq("email", email).maybeSingle(),
    db.from("profiles").select("id").eq("email", email).maybeSingle(),
    db.from("allowlist").select("email").eq("email", email).maybeSingle(),
  ]);
  if (admin) return { ok: false, message: "That email is already an admin." };
  if (member || listed) return { ok: false, message: "That email belongs to a member or a member invite. Use a separate email for admin." };
  const { data: row, error } = await db.from("admins")
    .insert({ email, name, code_hash: await hashCode(input.code), invited_by: actor.adminId, timezone: actor.timezone }).select("id").single();
  if (error) {
    console.error("[admin] Couldn't invite an admin:", error.message);
    return FAILED;
  }
  await audit(db, actor.id, "admin.invite", { admin: row.id }, { email, name });
  return { ok: true };
}

async function activeAdminCount(db: Db) {
  const { count } = await db.from("admins").select("id", { count: "exact", head: true }).eq("status", "active");
  return count ?? 0;
}

export async function setAdminDisabled(actor: AdminActor, id: string, disabled: boolean): Promise<AdminResult> {
  const db = createAdminClient();
  const { data: target } = await db.from("admins").select("id, status, user_id").eq("id", id).maybeSingle();
  if (!target) return { ok: false, message: "That admin no longer exists." };
  const problem = checkAdminChange({ actorAdminId: actor.adminId, target, activeAdmins: await activeAdminCount(db), change: disabled ? "disable" : "enable" });
  if (problem) return { ok: false, message: problem };
  if ((target.status === "disabled") === disabled) return { ok: true };
  // Enabling an admin who never signed in puts them back to invited.
  const status = disabled ? "disabled" : target.user_id ? "active" : "invited";
  const { error } = await db.from("admins").update({ status }).eq("id", id);
  if (error) return FAILED;
  await audit(db, actor.id, disabled ? "admin.disable" : "admin.enable", { admin: id }, {});
  return { ok: true };
}

/** Sets a new starting code for another admin; they must replace it at their next sign-in. */
export async function resetAdminCode(actor: AdminActor, id: string, code: string): Promise<AdminResult> {
  const problem = codeProblem(code);
  if (problem) return { ok: false, message: `New code: ${problem}` };
  const db = createAdminClient();
  const { data: target } = await db.from("admins").select("id, status").eq("id", id).maybeSingle();
  if (!target) return { ok: false, message: "That admin no longer exists." };
  const blocked = checkAdminChange({ actorAdminId: actor.adminId, target, activeAdmins: await activeAdminCount(db), change: "reset" });
  if (blocked) return { ok: false, message: blocked };
  const { error } = await db.from("admins").update({ code_hash: await hashCode(code), must_change_code: true, code_changed_at: new Date().toISOString() }).eq("id", id);
  if (error) return FAILED;
  await audit(db, actor.id, "admin.reset_code", { admin: id }, {});
  return { ok: true };
}

/** The signed-in admin replaces their own code, giving the current one. */
export async function changeMyCode(actor: AdminActor, current: string, next: string): Promise<AdminResult> {
  const db = createAdminClient();
  const { data: me } = await db.from("admins").select("code_hash").eq("id", actor.adminId).single();
  if (!me || !(await codeMatches(current, me.code_hash))) return { ok: false, message: "Your current code didn't match." };
  const problem = codeProblem(next);
  if (problem) return { ok: false, message: `New code: ${problem}` };
  if (next === current) return { ok: false, message: "Choose a code different from the current one." };
  const { error } = await db.from("admins").update({ code_hash: await hashCode(next), must_change_code: false, code_changed_at: new Date().toISOString() }).eq("id", actor.adminId);
  if (error) return FAILED;
  await audit(db, actor.id, "admin.code_changed", { admin: actor.adminId }, {});
  return { ok: true };
}
