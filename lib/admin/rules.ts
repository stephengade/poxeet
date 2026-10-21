import { randomInt } from "node:crypto";
import type { AiSource, AuditKind, InviteHow, MemberChange } from "./types";

// The admin area's rules, kept free of the database so they're easy to test: access codes, what an admin may
// change, how audit entries read, and the purchases export. Server only (node:crypto).

// No 0/O or 1/I/L, so a code read aloud or retyped from a screenshot still works.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newAccessCode(length = 8) {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** "7d", "2w", "3m", "1y" from `now`, null for "never", undefined when the text isn't one of those. */
export function expiryFrom(text: string, now = new Date()): Date | null | undefined {
  if (text === "never") return null;
  const match = /^(\d{1,3})([dwmy])$/.exec(text);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const date = new Date(now);
  if (match[2] === "d") date.setDate(date.getDate() + amount);
  if (match[2] === "w") date.setDate(date.getDate() + amount * 7);
  if (match[2] === "m") date.setMonth(date.getMonth() + amount);
  if (match[2] === "y") date.setFullYear(date.getFullYear() + amount);
  return date;
}

export const MAX_CAP = 1000;

/** Why an admin can't make this change to a member, or null. Admins aren't members (D-032), so only the cap is checked. */
export function checkMemberChange(change: MemberChange): string | null {
  if (change.cap !== undefined && (!Number.isInteger(change.cap) || change.cap < 1 || change.cap > MAX_CAP)) {
    return `The daily cap is a whole number from 1 to ${MAX_CAP.toLocaleString("en-US")}.`;
  }
  return null;
}

/**
 * Why an admin can't disable or reset another admin, or null. Nobody disables themselves or resets their own code
 * here (they change it themselves), and the last active admin can't be disabled, so the instance always has one.
 */
export function checkAdminChange(input: {
  actorAdminId: string;
  target: { id: string; status: "invited" | "active" | "disabled" };
  activeAdmins: number;
  change: "disable" | "enable" | "reset";
}): string | null {
  const { actorAdminId, target, activeAdmins, change } = input;
  if (actorAdminId === target.id) return change === "reset" ? "Change your own code under Your access code." : "You can't disable yourself. Ask another admin.";
  if (change === "disable" && target.status === "active" && activeAdmins <= 1) return "This is the only active admin. Add another first.";
  if (change === "reset" && target.status === "disabled") return "Enable them first.";
  return null;
}

/** Which key a member's AI runs on, in key-resolution order. */
export function aiSourceOf(row: { has_own_key: boolean; master_key_access: string; credits: number | null }): AiSource {
  if (row.has_own_key) return "own";
  if (row.master_key_access === "granted") return "instance";
  return row.credits !== null && row.credits > 0 ? "credits" : "none";
}

export function inviteState(row: { access_type: InviteHow; access_code: string | null; access_code_expires_at: string | null }, joined: boolean, now = new Date()) {
  if (joined) return "joined" as const;
  const expired = row.access_type === "code" && row.access_code && row.access_code_expires_at && new Date(row.access_code_expires_at) <= now;
  return expired ? ("expired" as const) : ("waiting" as const);
}

const HOW: Record<InviteHow, string> = { all: "Email or access code", code: "Access code only", email: "Email only" };

const shortDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** How an audit entry reads: its group, a sentence naming the member, and a detail line. */
export function describeAudit(action: string, details: Record<string, unknown>, target: string): { kind: AuditKind; text: string; detail: string | null } {
  const d = details;
  switch (action) {
    case "member.instance_key":
      return { kind: "ai", text: d.granted ? `Granted the instance key to ${target}` : `Removed the instance key from ${target}`, detail: null };
    case "member.cap":
      return { kind: "ai", text: `Changed ${target}'s daily cap`, detail: `${d.from} → ${d.to} AI calls a day` };
    case "member.admin":
      return { kind: "account", text: d.admin ? `Made ${target} an admin` : `Removed ${target}'s admin role`, detail: null };
    case "admin.invite":
      return { kind: "admins", text: `Invited ${target} as an admin`, detail: "Starting access code set" };
    case "admin.joined":
      return { kind: "admins", text: `${target} joined as an admin`, detail: "Chose their own access code" };
    case "admin.disable":
      return { kind: "admins", text: `Disabled ${target}'s admin access`, detail: "Signed out of the dashboard" };
    case "admin.enable":
      return { kind: "admins", text: `Enabled ${target}'s admin access`, detail: null };
    case "admin.reset_code":
      return { kind: "admins", text: `Reset ${target}'s access code`, detail: "They choose a new one at their next sign-in" };
    case "admin.code_changed":
      return { kind: "admins", text: `${target} changed their access code`, detail: null };
    case "member.suspend":
      return { kind: "account", text: `Suspended ${target}`, detail: "Signed out; publishing and AI stopped" };
    case "member.reinstate":
      return { kind: "account", text: `Lifted ${target}'s suspension`, detail: null };
    case "credits.grant": {
      const amount = Number(d.amount);
      const text = amount > 0 ? `Granted ${amount.toLocaleString("en-US")} credits to ${target}` : `Took ${Math.abs(amount).toLocaleString("en-US")} credits from ${target}`;
      return { kind: "credits", text, detail: d.note ? `Note: "${d.note}"` : null };
    }
    case "signup.mode":
      return { kind: "access", text: d.to === "open" ? "Opened sign-up to everyone" : "Changed sign-up to invite only", detail: null };
    case "invite.add": {
      const extras = [d.instanceKey && "instance key on joining", d.sent && "invite emailed"].filter(Boolean);
      return { kind: "access", text: `Invited ${target}`, detail: [HOW[d.how as InviteHow] ?? null, ...extras].filter(Boolean).join(" · ") || null };
    }
    case "invite.code":
      return { kind: "access", text: `Made a new access code for ${target}`, detail: d.expires ? `Works until ${shortDate(String(d.expires))}` : "No expiry" };
    case "invite.remove":
      return { kind: "access", text: `Removed ${target} from the access list`, detail: null };
    default:
      return { kind: "account", text: action, detail: null };
  }
}
