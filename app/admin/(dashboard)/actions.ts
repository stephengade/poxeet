"use server";

import { revalidatePath } from "next/cache";
import * as admin from "../../../lib/admin/server";
import type { AdminResult, InviteInput, MemberChange } from "../../../lib/admin/types";

// The admin pages' changes. Server actions can be called directly, so each one checks again that the caller is
// an active admin before doing anything; lib/admin/server.ts does the work and writes the audit log.

const NOT_ADMIN: AdminResult = { ok: false, message: "Only an admin can do that. Sign in again if you were one." };

async function asAdmin<T extends AdminResult>(work: (actor: admin.AdminActor) => Promise<T>): Promise<T | AdminResult> {
  const actor = await admin.getAdminActor();
  if (!actor) return NOT_ADMIN;
  const result = await work(actor);
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function updateMember(id: string, change: MemberChange) {
  return asAdmin((actor) => admin.updateMember(actor, id, change));
}

export async function grantCredits(id: string, amount: number, note: string) {
  return asAdmin((actor) => admin.grantCredits(actor, id, amount, note));
}

export async function setSignupMode(mode: "open" | "invite_only") {
  if (mode !== "open" && mode !== "invite_only") return { ok: false, message: "Choose open or invite only." } satisfies AdminResult;
  return asAdmin((actor) => admin.setSignupMode(actor, mode));
}

export async function invite(input: InviteInput) {
  return asAdmin((actor) => admin.invite(actor, input));
}

export async function newCode(email: string) {
  return asAdmin((actor) => admin.newCode(actor, email));
}

export async function removeInvite(email: string) {
  return asAdmin((actor) => admin.removeInvite(actor, email));
}

export async function inviteAdmin(input: { name: string; email: string; code: string }) {
  return asAdmin((actor) => admin.inviteAdmin(actor, input));
}

export async function setAdminDisabled(id: string, disabled: boolean) {
  return asAdmin((actor) => admin.setAdminDisabled(actor, id, disabled === true));
}

export async function resetAdminCode(id: string, code: string) {
  return asAdmin((actor) => admin.resetAdminCode(actor, id, String(code)));
}

export async function changeMyCode(current: string, next: string) {
  return asAdmin((actor) => admin.changeMyCode(actor, String(current), String(next)));
}
