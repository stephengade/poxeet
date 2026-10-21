"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkKey, creditsAvailable } from "../../../../../lib/ai/server";
import { starterCredits } from "../../../../../lib/billing/config";
import { grantStarterCredits } from "../../../../../lib/billing/credits";
import { PROVIDER_IDS } from "../../../../../lib/ai/providers";
import { encryptionConfigured, seal, toBytea } from "../../../../../lib/crypto";
import { createAdminClient, getSecretKey } from "../../../../../lib/supabase/admin";
import { blockingStep, getMember } from "../../../../../lib/member";
import { createClient } from "../../../../../lib/supabase/server";

// A member's own AI key. Members can't read or write user_api_keys directly (it holds secrets), so these
// actions write it with the secret key, always for the signed-in member only. The key is checked with the
// provider first, then stored encrypted; only its last 4 characters are ever shown again.

const keySchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  apiKey: z.string().trim().min(20, "That key looks too short. Copy the whole key.").max(400, "That key looks too long.")
    .regex(/^\S+$/, "Keys don't contain spaces."),
});
export type SaveKeyInput = z.input<typeof keySchema>;
export type SaveKeyResult = { ok: true; last4: string } | { ok: false; field?: "apiKey"; message: string };

async function signedInUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function saveAiKey(input: SaveKeyInput): Promise<SaveKeyResult> {
  const parsed = keySchema.safeParse(input);
  if (!parsed.success) return { ok: false, field: "apiKey", message: parsed.error.issues[0]?.message ?? "Check the key." };
  const user = await signedInUser();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  if (!getSecretKey() || !encryptionConfigured()) {
    console.error("[ai] Saving keys needs SUPABASE_SECRET_KEY and ENCRYPTION_KEY.");
    return { ok: false, message: "Saving keys isn't set up yet. Ask the app owner to finish setup." };
  }

  // Setup goes in order: no AI key until LinkedIn is connected.
  const blocker = blockingStep(await getMember(), "ai");
  if (blocker) return { ok: false, message: `${blocker.title} first. AI access unlocks after that.` };

  const { provider, apiKey } = parsed.data;
  const check = await checkKey(provider, apiKey);
  if (!check.ok) return { ok: false, field: check.reason === "invalid" || check.reason === "no_access" ? "apiKey" : undefined, message: check.message };

  const sealed = seal(apiKey);
  const last4 = apiKey.slice(-4);
  const { error } = await createAdminClient().from("user_api_keys").upsert({
    user_id: user.id,
    provider,
    ciphertext: toBytea(sealed.ciphertext),
    iv: toBytea(sealed.iv),
    tag: toBytea(sealed.tag),
    key_version: sealed.keyVersion,
    last4,
    validated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return { ok: false, message: "We couldn't save the key. Try again in a moment." };

  revalidatePath("/app", "layout");
  return { ok: true, last4 };
}

export async function removeAiKey(): Promise<{ ok: boolean; message?: string }> {
  const user = await signedInUser();
  if (!user || !getSecretKey()) return { ok: false, message: "Your session has ended. Sign in again." };
  const { error } = await createAdminClient().from("user_api_keys").delete().eq("user_id", user.id);
  if (error) return { ok: false, message: "We couldn't remove the key. Try again in a moment." };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export type ChooseCreditsResult = { ok: true; granted: number } | { ok: false; message: string };

/**
 * "Use Poxeet credits": gives the one-time starter credits (if this instance offers them and the member never had
 * them). A member with no starter credits and no balance still needs to buy before AI access counts as set up.
 */
export async function chooseCredits(): Promise<ChooseCreditsResult> {
  if (!creditsAvailable()) return { ok: false, message: "Credits aren't available on this instance." };
  const user = await signedInUser();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const blocker = blockingStep(await getMember(), "ai");
  if (blocker) return { ok: false, message: `${blocker.title} first. AI access unlocks after that.` };
  try {
    const granted = await grantStarterCredits(user.id);
    revalidatePath("/app", "layout");
    return { ok: true, granted: granted ? starterCredits() : 0 };
  } catch (error) {
    console.error("[billing] Starter credits failed:", error);
    return { ok: false, message: "We couldn't set up credits. Try again in a moment." };
  }
}
