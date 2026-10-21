import { AiJobError, AiProviderError, generateText, runAiJob } from "../ai/server";
import { MIN_VOICE_POSTS } from "../import/posts";
import { createAdminClient } from "../supabase/admin";
import { confidenceFor, EDITABLE_FIELDS, parseProfile, voiceProfileSchema, type VoiceProfile } from "./profile";
import { voiceAnalystPrompt, VOICE_ANALYST_SYSTEM } from "./prompt";
import { computeStats, pickSample, type VoicePost } from "./stats";

// Voice analysis (PRD section 9, D-024), server only. Reads a member's posts, measures them, samples, asks the
// voice analyst through runAiJob (so credits are held and settled and usage is logged), validates the answer,
// retries once with the problem named, and saves the result as the new active version. Fields the member locked
// by editing keep their value. The status of the latest run lives in voice_jobs for the Voice page to show.

/** The analyst may think before answering; this covers thinking plus a full profile. */
const MAX_OUTPUT_TOKENS = 16_000;
/** The most posts read from the database for one analysis (stats use all of them; the sample is capped). */
const MAX_POSTS_READ = 1_000;
/** A run still "running" after this long is treated as dead (the server restarted mid-job). */
export const STALE_JOB_MS = 10 * 60 * 1000;

export type FailureReason = "no_posts" | "no_credits" | "no_access" | "not_configured" | "cap_reached" | "provider" | "invalid" | "error";
export type AnalysisResult = { ok: true; version: number } | { ok: false; reason: FailureReason; message: string };

/** Rough tokens for a prompt, for the credit hold: about 3 characters per token, rounded up generously. */
const tokensFor = (text: string) => Math.ceil(text.length / 3) + 200;

/** Keeps the member's locked fields from the previous version, and records the measured evidence. */
export function finalizeProfile(raw: VoiceProfile, options: {
  postCount: number;
  idMap: Map<string, string>;
  stats: Record<string, unknown>;
  previous: VoiceProfile | null;
}): VoiceProfile {
  const realId = (id: string) => options.idMap.get(id) ?? id;
  const profile: VoiceProfile = {
    ...raw,
    confidence: confidenceFor(options.postCount, raw.confidence),
    signature_moves: raw.signature_moves.map((move) => ({ ...move, example_post_ids: move.example_post_ids.map(realId) })),
    evidence: { sampled_post_ids: [...options.idMap.values()], stats: options.stats },
    locked_fields: [],
  };
  const locked = (options.previous?.locked_fields ?? []).filter((field): field is (typeof EDITABLE_FIELDS)[number] =>
    (EDITABLE_FIELDS as readonly string[]).includes(field));
  for (const field of locked) {
    (profile as Record<string, unknown>)[field] = options.previous![field];
  }
  profile.locked_fields = locked;
  return voiceProfileSchema.parse(profile);
}

/** Runs one analysis for a member and saves it. Never throws: failures come back with a message to show. */
export async function analyzeVoice(userId: string): Promise<AnalysisResult> {
  const admin = createAdminClient();
  const [{ data: rows, error: postsError }, { data: member }, { data: active }] = await Promise.all([
    admin.from("imported_posts").select("id, text, posted_at").eq("user_id", userId)
      .order("posted_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(MAX_POSTS_READ),
    admin.from("profiles").select("brief").eq("id", userId).maybeSingle(),
    admin.from("voice_profiles").select("profile").eq("user_id", userId).eq("is_active", true).maybeSingle(),
  ]);
  if (postsError) return { ok: false, reason: "error", message: "We couldn't read your posts. Try again in a minute." };
  const posts: VoicePost[] = (rows ?? []).map((row) => ({ id: row.id, text: row.text, postedAt: row.posted_at }));
  if (posts.length < MIN_VOICE_POSTS) {
    return { ok: false, reason: "no_posts", message: `Add at least ${MIN_VOICE_POSTS} of your posts first.` };
  }

  const stats = computeStats(posts);
  const { sample, idMap } = pickSample(posts);
  const sampleIds = new Set(idMap.keys());
  const brief = member?.brief && typeof member.brief === "object" ? (member.brief as Record<string, unknown>) : {};
  const previousParsed = active?.profile ? voiceProfileSchema.safeParse(active.profile) : null;
  const previous = previousParsed?.success ? previousParsed.data : null;

  let problem: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = voiceAnalystPrompt({ stats, posts: sample, brief, problem });
    const job = { job: "analyze", maxInputTokens: tokensFor(VOICE_ANALYST_SYSTEM + prompt), maxOutputTokens: MAX_OUTPUT_TOKENS };
    try {
      // Each attempt is its own job: a retry after a schema failure is charged as a separate call (PRD section 8).
      const result = await runAiJob(userId, job, async (access) => {
        const generated = await generateText(access, { system: VOICE_ANALYST_SYSTEM, prompt, maxOutputTokens: MAX_OUTPUT_TOKENS, json: true });
        if (generated.stop === "refused") throw new AiJobError("The model declined to analyse these posts.", generated.usage);
        const parsed = parseProfile(generated.text, sampleIds);
        if (!parsed.ok) {
          throw new AiJobError(generated.stop === "max_tokens" ? "The answer was cut off before it finished." : parsed.problem, generated.usage);
        }
        return { value: { profile: parsed.profile, model: access.model }, usage: generated.usage };
      });
      if (!result.ok) {
        return { ok: false, reason: result.reason, message: result.reason === "no_credits"
          ? "You're out of credits. Buy credits or add your own AI key, then try again."
          : result.message };
      }
      const profile = finalizeProfile(result.value.profile, { postCount: posts.length, idMap, stats, previous });
      const { data: version, error } = await admin.rpc("save_voice_profile", {
        p_user: userId, p_profile: profile, p_origin: "generated", p_post_count: posts.length, p_model: result.value.model,
      });
      if (error) {
        console.error("[voice] Couldn't save the profile:", error.message);
        return { ok: false, reason: "error", message: "The analysis worked but we couldn't save it. Try again." };
      }
      return { ok: true, version: Number(version) };
    } catch (error) {
      if (error instanceof AiJobError) {
        problem = error.message;
        console.warn(`[voice] Analysis attempt ${attempt + 1} rejected: ${problem}`);
        continue;
      }
      if (error instanceof AiProviderError) return { ok: false, reason: "provider", message: error.message };
      console.error("[voice] Analysis failed:", error);
      return { ok: false, reason: "error", message: "Something went wrong on our side. Try again in a minute." };
    }
  }
  return { ok: false, reason: "invalid", message: "The AI's answer didn't come out right twice. Try again; adding a few more posts often helps." };
}

/**
 * Marks a run as started, unless one is already running (and not stale). Returns false when one is running, so
 * a double click or a second tab doesn't start (and charge for) a second analysis.
 */
export async function claimVoiceJob(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: current } = await admin.from("voice_jobs").select("status, started_at").eq("user_id", userId).maybeSingle();
  if (current?.status === "running" && Date.now() - new Date(current.started_at).getTime() < STALE_JOB_MS) return false;
  const { error } = await admin.from("voice_jobs").upsert({
    user_id: userId, status: "running", reason: null, message: null, started_at: new Date().toISOString(), finished_at: null,
  });
  if (error) throw new Error(`Couldn't start the analysis: ${error.message}`);
  return true;
}

/** Runs a claimed analysis and records how it ended. For `after()`: never throws. */
export async function runVoiceJob(userId: string) {
  const result = await analyzeVoice(userId).catch((error): AnalysisResult => {
    console.error("[voice] Analysis crashed:", error);
    return { ok: false, reason: "error", message: "Something went wrong on our side. Try again in a minute." };
  });
  const { error } = await createAdminClient().from("voice_jobs").update(result.ok
    ? { status: "done", reason: null, message: null, finished_at: new Date().toISOString() }
    : { status: "failed", reason: result.reason, message: result.message, finished_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) console.error("[voice] Couldn't record the result:", error.message);
  return result;
}
