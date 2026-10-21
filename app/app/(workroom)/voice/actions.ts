"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { resolveAiAccess } from "../../../../lib/ai/server";
import { MIN_VOICE_POSTS } from "../../../../lib/import/posts";
import { getMember } from "../../../../lib/member";
import { getSecretKey } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
import { claimVoiceJob, runVoiceJob, STALE_JOB_MS } from "../../../../lib/voice/analyze";

// Starting voice analysis and checking on it. The analysis itself runs after the response (next/server after()),
// so the member isn't kept waiting; the Voice page and setup's step 3 poll voiceStatus.

export type StartResult =
  | { ok: true; started: boolean }
  | { ok: false; reason: "no_posts" | "no_access" | "no_credits" | "not_configured" | "cap_reached" | "error"; message: string };

export async function startVoiceAnalysis(): Promise<StartResult> {
  const member = await getMember();
  if (!getSecretKey()) return { ok: false, reason: "not_configured", message: "AI isn't set up on this instance yet." };
  if (member.setup.importedPosts < MIN_VOICE_POSTS) {
    return { ok: false, reason: "no_posts", message: `Add at least ${MIN_VOICE_POSTS} of your posts first.` };
  }
  // Say now, not a minute later, when there's no key or no credits.
  const access = await resolveAiAccess(member.id);
  if (!access.ok) return { ok: false, reason: access.reason, message: access.message };
  try {
    const started = await claimVoiceJob(member.id);
    if (started) after(() => runVoiceJob(member.id).then(() => revalidatePath("/app", "layout")));
    return { ok: true, started };
  } catch (error) {
    console.error("[voice] Couldn't start the analysis:", error);
    return { ok: false, reason: "error", message: "We couldn't start the analysis. Try again in a minute." };
  }
}

export type VoiceStatus =
  | { status: "idle" }
  | { status: "running"; startedAt: string }
  | { status: "done"; version: number | null }
  | { status: "failed"; reason: string | null; message: string };

/** The member's latest analysis, read as them (Row Level Security). */
export async function voiceStatus(): Promise<VoiceStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "idle" };
  const [{ data: job }, { data: active }] = await Promise.all([
    supabase.from("voice_jobs").select("status, reason, message, started_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("voice_profiles").select("version").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
  ]);
  if (!job) return active ? { status: "done", version: active.version } : { status: "idle" };
  if (job.status === "running") {
    if (Date.now() - new Date(job.started_at).getTime() > STALE_JOB_MS) {
      return { status: "failed", reason: "error", message: "The analysis stopped before it finished. Try again." };
    }
    return { status: "running", startedAt: job.started_at };
  }
  if (job.status === "failed") return { status: "failed", reason: job.reason, message: job.message ?? "The analysis didn't finish. Try again." };
  return { status: "done", version: active?.version ?? null };
}
