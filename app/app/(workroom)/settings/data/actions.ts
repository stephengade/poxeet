"use server";

import { revalidatePath } from "next/cache";
import { deleteMemberData } from "../../../../../lib/member-data";
import { getSecretKey } from "../../../../../lib/supabase/admin";
import { createClient } from "../../../../../lib/supabase/server";

/** Deletes the signed-in member's posts, voice, calendars and LinkedIn connection, keeping the account (D-030). */
export async function deleteMyData(confirm: string): Promise<{ ok: boolean; message?: string }> {
  if (confirm !== "DELETE") return { ok: false, message: "Type DELETE to confirm." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !getSecretKey()) return { ok: false, message: "Your session has ended. Sign in again." };
  try {
    await deleteMemberData(user.id);
  } catch (error) {
    console.error("[data] Delete failed:", error);
    return { ok: false, message: "We couldn't delete your data. Nothing was removed; try again in a minute." };
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}
