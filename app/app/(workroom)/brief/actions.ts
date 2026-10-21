"use server";

import { revalidatePath } from "next/cache";
import { briefSchema, type Brief } from "../../../../lib/brief";
import { createClient } from "../../../../lib/supabase/server";

export type SaveBriefResult = { ok: true; savedAt: string } | { ok: false; message: string };

/** Saves the brief on the member's own profile (Row Level Security limits it to them). */
export async function saveBrief(input: Brief): Promise<SaveBriefResult> {
  const parsed = briefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the brief." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const savedAt = new Date().toISOString();
  const { error } = await supabase.from("profiles").update({ brief: { ...parsed.data, updated_at: savedAt } }).eq("id", user.id);
  if (error) return { ok: false, message: "We couldn't save your brief. Try again in a moment." };
  revalidatePath("/app", "layout");
  return { ok: true, savedAt };
}
