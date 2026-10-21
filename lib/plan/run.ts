import { AiJobError, AiProviderError, generateText, runAiJob } from "../ai/server";
import { readBrief } from "../brief";
import { sendDraftsReady } from "../notify";
import { createAdminClient } from "../supabase/admin";
import { voiceProfileSchema, type VoiceProfile } from "../voice/profile";
import { DRAFTER_SYSTEM, drafterPrompt, parseDraft, searchTerms, type Draft, type SlotBrief } from "./drafter";
import { parsePlan, PLANNER_SYSTEM, plannerPrompt, type PlannedSlot } from "./planner";
import type { PlanSlot } from "./slots";

// Planning and drafting a calendar (PRD section 8, CAL-1 to CAL-3, D-025), server only. The planner runs once;
// then drafts are written a week at a time and saved after each week, so a failure keeps the finished weeks and
// a retry picks up where it stopped. Every model call goes through runAiJob (credits, usage logging). The first
// week saved in a run sends "New drafts are ready" to members who want it (lib/notify.ts).

const PLAN_MAX_OUTPUT = 16_000;
const DRAFT_MAX_OUTPUT = 8_000;
const EXAMPLES = 6;

export type FailReason = "no_credits" | "no_access" | "not_configured" | "cap_reached" | "provider" | "invalid" | "error";
type Outcome<T> = { ok: true; value: T; model: string | null } | { ok: false; reason: FailReason; message: string };

const tokensFor = (text: string) => Math.ceil(text.length / 3) + 200;

/**
 * One model call that must return valid JSON: runs through runAiJob, retries once naming what was wrong, and
 * never throws. Each attempt is its own job, so a retry is charged as a separate call (PRD section 8).
 */
export async function generateValidated<T>(userId: string, job: string, options: {
  system: string;
  prompt: (problem?: string) => string;
  /** `final` is true on the last attempt, for checks that should flag rather than fail by then. */
  parse: (raw: string, final: boolean) => { ok: true; value: T } | { ok: false; problem: string };
  maxOutputTokens: number;
}): Promise<Outcome<T>> {
  let problem: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = options.prompt(problem);
    try {
      const result = await runAiJob(userId, { job, maxInputTokens: tokensFor(options.system + prompt), maxOutputTokens: options.maxOutputTokens }, async (access) => {
        const generated = await generateText(access, { system: options.system, prompt, maxOutputTokens: options.maxOutputTokens, json: true });
        if (generated.stop === "refused") throw new AiJobError("The model declined this request.", generated.usage);
        const parsed = options.parse(generated.text, attempt === 1);
        if (!parsed.ok) throw new AiJobError(generated.stop === "max_tokens" ? "The answer was cut off before it finished." : parsed.problem, generated.usage);
        return { value: { value: parsed.value, model: access.model }, usage: generated.usage };
      });
      if (!result.ok) {
        return { ok: false, reason: result.reason, message: result.reason === "no_credits"
          ? "You're out of credits. Buy credits or add your own AI key, then try again."
          : result.message };
      }
      return { ok: true, value: result.value.value, model: result.value.model };
    } catch (error) {
      if (error instanceof AiJobError) {
        problem = error.message;
        console.warn(`[plan] ${job} attempt ${attempt + 1} rejected: ${problem}`);
        continue;
      }
      if (error instanceof AiProviderError) return { ok: false, reason: "provider", message: error.message };
      console.error(`[plan] ${job} failed:`, error);
      return { ok: false, reason: "error", message: "Something went wrong on our side. Try again in a minute." };
    }
  }
  return { ok: false, reason: "invalid", message: "The AI's answer didn't come out right twice. Try again." };
}

/** The voice profile as the planner and drafter see it: without the evidence block (ids and stats). */
function forPrompt(profile: VoiceProfile) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { evidence, locked_fields, ...rest } = profile;
  return rest;
}

type Context = { profile: VoiceProfile; profileId: string; brief: ReturnType<typeof readBrief>; posts: Array<{ id: string; text: string }> };

/** What every planning call needs: the active voice profile, the brief and the member's own posts. */
export async function loadContext(userId: string): Promise<Context | null> {
  const admin = createAdminClient();
  const [{ data: voice }, { data: member }, { data: posts }] = await Promise.all([
    admin.from("voice_profiles").select("id, profile").eq("user_id", userId).eq("is_active", true).maybeSingle(),
    admin.from("profiles").select("brief").eq("id", userId).single(),
    admin.from("imported_posts").select("id, text, posted_at").eq("user_id", userId)
      .order("posted_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(500),
  ]);
  const parsed = voice ? voiceProfileSchema.safeParse(voice.profile) : null;
  if (!voice || !parsed?.success) return null;
  return { profile: parsed.data, profileId: voice.id, brief: readBrief(member?.brief), posts: (posts ?? []).map((post) => ({ id: post.id, text: post.text })) };
}

/**
 * 5 to 8 style references for a slot (PRD VOICE-4): the member's posts sharing the most words with the angle,
 * topped up with their longest posts. Done in code over the member's own posts rather than with Postgres
 * full-text search: the posts are already loaded, and the ranking is easy to test.
 */
export function pickExamples(posts: Array<{ id: string; text: string }>, angle: string, count = EXAMPLES) {
  const terms = searchTerms(angle);
  const scored = posts.map((post) => {
    const text = post.text.toLowerCase();
    return { post, score: terms.filter((term) => text.includes(term)).length };
  });
  const relevant = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || b.post.text.length - a.post.text.length).map((item) => item.post);
  const longest = [...posts].sort((a, b) => b.text.length - a.text.length);
  const chosen: string[] = [];
  for (const post of [...relevant, ...longest]) {
    if (chosen.length >= count) break;
    if (!chosen.includes(post.text)) chosen.push(post.text);
  }
  return chosen;
}

/** Drafts one post for a slot (also used by Regenerate, with an instruction and the current draft). */
export async function draftPost(userId: string, context: Context, slot: SlotBrief, options: { instruction?: string | null; currentDraft?: string | null } = {}) {
  const examples = pickExamples(context.posts, slot.topic_angle);
  return generateValidated<Draft>(userId, "draft", {
    system: DRAFTER_SYSTEM,
    prompt: (problem) => drafterPrompt({ voiceProfile: forPrompt(context.profile), brief: context.brief, slot, examples, ...options, problem }),
    parse: (raw, final) => {
      const parsed = parseDraft(raw, final);
      return parsed.ok ? { ok: true, value: parsed.draft } : parsed;
    },
    maxOutputTokens: DRAFT_MAX_OUTPUT,
  });
}

async function setCalendar(calendarId: string, values: Record<string, unknown>) {
  const { error } = await createAdminClient().from("calendars").update({ ...values, updated_at: new Date().toISOString() }).eq("id", calendarId);
  if (error) console.error("[plan] Couldn't update the calendar:", error.message);
}

/** The first local date of a plan week (week 0 starts on the calendar's start date). */
function weekStartOf(startDate: string, week: number) {
  const value = new Date(`${startDate}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + week * 7);
  return value.toISOString().slice(0, 10);
}

/**
 * Runs a calendar to the end from wherever it stands: plans if it has no plan yet, then drafts each remaining
 * week, saving after each. Never throws; a failure is recorded on the calendar (status failed, reason, message).
 */
export async function runCalendar(calendarId: string) {
  const admin = createAdminClient();
  const { data: calendar } = await admin.from("calendars").select("id, user_id, plan, start_date, timezone, weeks_total, weeks_done, status").eq("id", calendarId).single();
  if (!calendar) return;
  const userId = calendar.user_id as string;
  const fail = (reason: FailReason, message: string) => setCalendar(calendarId, { status: "failed", reason, message });
  // The drafts-ready email runs alongside the drafting (it never throws) and is awaited before the run returns.
  let notice: Promise<boolean> | null = null;
  try {
    const context = await loadContext(userId);
    if (!context) return fail("error", "Analyse your voice before planning: drafts are written in it.");

    let plan = (calendar.plan ?? []) as Array<PlanSlot & Partial<PlannedSlot>>;
    if (!plan.length) return fail("error", "This plan has no posting slots. Check your publishing schedule.");

    // 1. Plan, unless the plan already has pillars and angles (a retry after a drafting failure).
    if (plan.some((slot) => !slot.topic_angle)) {
      await setCalendar(calendarId, { status: "planning", reason: null, message: null });
      const recentPosts = context.posts.slice(0, 20).map((post) => post.text.split("\n").find((line) => line.trim())?.slice(0, 160) ?? "");
      const planned = await generateValidated(userId, "plan", {
        system: PLANNER_SYSTEM,
        prompt: (problem) => plannerPrompt({ voiceProfile: forPrompt(context.profile), brief: context.brief, slots: plan, recentPosts, problem }),
        parse: (raw) => {
          const parsed = parsePlan(raw, plan);
          return parsed.ok ? { ok: true, value: parsed } : parsed;
        },
        maxOutputTokens: PLAN_MAX_OUTPUT,
      });
      if (!planned.ok) return fail(planned.reason, planned.message);
      plan = planned.value.plan;
      await setCalendar(calendarId, { plan, pillars: planned.value.pillars, status: "drafting" });
    } else {
      await setCalendar(calendarId, { status: "drafting", reason: null, message: null });
    }

    // 2. Draft a week at a time; the posts of one week are written in parallel and saved together.
    const weeksTotal = Math.max(...plan.map((slot) => slot.week)) + 1;
    const { data: existing } = await admin.from("scheduled_posts").select("slot_index").eq("calendar_id", calendarId);
    const drafted = new Set((existing ?? []).map((row) => row.slot_index as number));
    for (let week = 0; week < weeksTotal; week++) {
      const todo = plan.filter((slot) => slot.week === week && !drafted.has(slot.index)) as PlannedSlot[];
      if (todo.length) {
        const results = await Promise.all(todo.map((slot) => draftPost(userId, context, slot)));
        const rows = todo.flatMap((slot, index) => {
          const result = results[index];
          if (!result.ok) return [];
          return [{
            user_id: userId, calendar_id: calendarId, slot_index: slot.index, scheduled_at: slot.scheduledAt, status: "draft",
            content: result.value.text, hook: result.value.hook, rationale: result.value.rationale, needs_user_input: result.value.needs_user_input,
            flags: result.value.flags, pillar: slot.pillar, post_type: slot.post_type, topic_angle: slot.topic_angle,
          }];
        });
        if (rows.length) {
          const { error } = await admin.from("scheduled_posts").upsert(rows, { onConflict: "calendar_id,slot_index", ignoreDuplicates: true });
          if (error) {
            console.error("[plan] Couldn't save drafts:", error.message);
            return fail("error", "We couldn't save this week's drafts. Try again.");
          }
          rows.forEach((row) => drafted.add(row.slot_index));
          notice ??= sendDraftsReady(userId, {
            count: rows.length, weekStart: weekStartOf(calendar.start_date, week), moreWeeks: weeksTotal - week - 1, timeZone: calendar.timezone,
          });
        }
        const failed = results.find((result): result is Extract<typeof result, { ok: false }> => !result.ok);
        if (failed) {
          await setCalendar(calendarId, { weeks_done: week, weeks_total: weeksTotal });
          return fail(failed.reason, failed.message);
        }
      }
      await setCalendar(calendarId, { weeks_done: week + 1, weeks_total: weeksTotal });
    }
    await setCalendar(calendarId, { status: "ready", reason: null, message: null });
  } catch (error) {
    console.error("[plan] Calendar run crashed:", error);
    await fail("error", "Something went wrong on our side. Try again in a minute.");
  } finally {
    await notice;
  }
}
