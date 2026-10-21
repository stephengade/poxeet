"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { fromBytea, unseal } from "../../../../../lib/crypto";
import { linkedInConfig, revokeToken } from "../../../../../lib/linkedin";
import { sendAccountNotice } from "../../../../../lib/notify";
import { createAdminClient, getSecretKey } from "../../../../../lib/supabase/admin";
import { createClient } from "../../../../../lib/supabase/server";

/** Deletes the member's LinkedIn token, and asks LinkedIn to revoke it (best effort). */
export async function disconnectLinkedIn(): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !getSecretKey()) return { ok: false, message: "Your session has ended. Sign in again." };

  const admin = createAdminClient();
  const { data: row } = await admin.from("linkedin_connections").select("ciphertext, iv, tag, display_name").eq("user_id", user.id).maybeSingle();
  const config = linkedInConfig();
  if (row && config) {
    try {
      const token = unseal({ ciphertext: fromBytea(row.ciphertext), iv: fromBytea(row.iv), tag: fromBytea(row.tag) });
      await revokeToken({ token, ...config });
    } catch { /* an unreadable token is deleted anyway */ }
  }
  const { error } = await admin.from("linkedin_connections").delete().eq("user_id", user.id);
  if (error) return { ok: false, message: "We couldn't disconnect LinkedIn. Try again in a moment." };
  if (row) after(() => sendAccountNotice(user.id, "linkedinDisconnected", { linkedinName: row.display_name }));
  revalidatePath("/app", "layout");
  return { ok: true };
}
