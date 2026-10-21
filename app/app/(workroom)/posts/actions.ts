"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_POST_CHARS } from "../../../../lib/import/posts";
import { draftPost, loadContext } from "../../../../lib/plan/run";
import { zonedToUtc } from "../../../../lib/plan/slots";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

// Reviewing drafts: edit the text, approve, skip, or regenerate with an instruction (PRD CAL-5, CAL-6).
// Writes run as the member (Row Level Security) except Regenerate's AI call, which goes through runAiJob.

/** Posts the member may still change: not sent, not being sent. */
const EDITABLE = ["draft", "approved", "skipped", "failed", "missed"];

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export type PostResult = { ok: true } | { ok: false; message: string };

const textSchema = z.string().trim().min(1, "A post needs some text.").max(MAX_POST_CHARS, `LinkedIn allows ${MAX_POST_CHARS.toLocaleString("en-US")} characters.`);

/** Saves edited text. Editing an approved post sends it back to draft, so it's reviewed again. */
export async function savePostText(id: string, text: string): Promise<PostResult> {
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the text." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const { data, error } = await supabase.from("scheduled_posts").update({ content: parsed.data, status: "draft", approved_at: null, needs_user_input: null })
    .eq("id", id).in("status", EDITABLE).select("id");
  if (error || !data?.length) return { ok: false, message: "We couldn't save that post. It may already be sending." };
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Approves, skips or returns posts to draft. Only posts not sent or sending change. */
export async function setPostStatus(ids: string[], status: "approved" | "skipped" | "draft"): Promise<PostResult & { changed?: number }> {
  // Server actions take whatever the client sends, so the status is checked here too (the trigger is the backstop).
  if (!z.enum(["approved", "skipped", "draft"]).safeParse(status).success) return { ok: false, message: "That change isn't allowed." };
  const list = (Array.isArray(ids) ? ids : []).filter((id) => z.uuid().safeParse(id).success).slice(0, 200);
  if (!list.length) return { ok: false, message: "No posts chosen." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const { data, error } = await supabase.from("scheduled_posts")
    .update({ status, approved_at: status === "approved" ? new Date().toISOString() : null })
    .in("id", list).in("status", EDITABLE).select("id");
  if (error) return { ok: false, message: "We couldn't update those posts. Try again." };
  revalidatePath("/app", "layout");
  return { ok: true, changed: data?.length ?? 0 };
}

/** Rewrites a member may ask for in a window, whatever key pays: each one is one or two model calls. */
const REGENERATE_LIMIT = { max: 30, windowSeconds: 60 * 60 };

/** Counts a rewrite against the member's hourly limit (take_auth_attempt, keyed by user id). False once it's used up. */
async function withinRegenerateLimit(userId: string) {
  const { data, error } = await createAdminClient().rpc("take_auth_attempt", {
    attempt_key: userId, attempt_kind: "regenerate", max_attempts: REGENERATE_LIMIT.max, window_seconds: REGENERATE_LIMIT.windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

/** Writes the post again for its slot, with an optional steer ("shorter", "more personal"). It comes back as a draft. */
export async function regeneratePost(id: string, instruction: string): Promise<PostResult & { text?: string }> {
  const steer = instruction.trim().slice(0, 200);
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const { data: post } = await supabase.from("scheduled_posts").select("id, status, content, scheduled_at, pillar, post_type, topic_angle").eq("id", id).maybeSingle();
  if (!post || !EDITABLE.includes(post.status)) return { ok: false, message: "That post can't be rewritten now." };
  const context = await loadContext(user.id);
  if (!context) return { ok: false, message: "Analyse your voice first: rewrites use it." };
  if (!(await withinRegenerateLimit(user.id))) {
    return { ok: false, message: `That's ${REGENERATE_LIMIT.max} rewrites in the last hour. Wait a while, then try again.` };
  }
  const slot = {
    date: post.scheduled_at.slice(0, 10), pillar: post.pillar ?? "", post_type: post.post_type ?? "",
    topic_angle: post.topic_angle ?? post.content.split("\n")[0],
  };
  const result = await draftPost(user.id, context, slot, { instruction: steer || "Write a fresh take on the same angle.", currentDraft: post.content });
  if (!result.ok) return { ok: false, message: result.message };
  const { error } = await createAdminClient().from("scheduled_posts").update({
    content: result.value.text, hook: result.value.hook, rationale: result.value.rationale, needs_user_input: result.value.needs_user_input,
    flags: result.value.flags, status: "draft", approved_at: null,
  }).eq("id", id).eq("user_id", user.id).in("status", EDITABLE);
  if (error) return { ok: false, message: "We couldn't save the new version. Try again." };
  revalidatePath("/app", "layout");
  return { ok: true, text: result.value.text };
}

/**
 * The member copied the post and published it on LinkedIn themselves (PRD CAL-8): it becomes posted "by hand"
 * and the publisher never sends it.
 */
export async function markPostedByHand(id: string): Promise<PostResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const { data, error } = await supabase.from("scheduled_posts")
    .update({ status: "posted", posted_via: "manual", posted_at: new Date().toISOString() })
    .eq("id", id).in("status", ["draft", "approved", "failed", "missed"]).select("id");
  if (error || !data?.length) return { ok: false, message: "We couldn't mark it as posted. It may already be sending." };
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** After a send we couldn't confirm: the member checked LinkedIn. It either went out, or should be sent again. */
export async function resolveNeedsCheck(id: string, outcome: "posted" | "approved"): Promise<PostResult> {
  if (outcome !== "posted" && outcome !== "approved") return { ok: false, message: "That change isn't allowed." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const { data, error } = await supabase.from("scheduled_posts")
    .update(outcome === "posted" ? { status: "posted", posted_via: "api", posted_at: new Date().toISOString(), last_error: null } : { status: "approved", last_error: null })
    .eq("id", id).eq("status", "needs_check").select("id");
  if (error || !data?.length) return { ok: false, message: "We couldn't update that post. Refresh and try again." };
  revalidatePath("/app", "layout");
  return { ok: true };
}

const rescheduleSchema = z.object({ date: z.iso.date(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time.") });

/**
 * Moves a post to another date and time in the member's timezone. Its status stays (an approved post stays
 * approved); a missed post moved to the future becomes approved again.
 */
export async function reschedulePost(id: string, input: z.input<typeof rescheduleSchema>): Promise<PostResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Pick a date and time." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const at = zonedToUtc(parsed.data.date, parsed.data.time, profile?.timezone ?? "UTC");
  if (at.getTime() < Date.now() + 60_000) return { ok: false, message: "Pick a time in the future." };
  const { data: post } = await supabase.from("scheduled_posts").select("status").eq("id", id).maybeSingle();
  if (!post || !["draft", "approved", "skipped", "failed", "missed"].includes(post.status)) return { ok: false, message: "That post can't be moved now." };
  const { error } = await supabase.from("scheduled_posts")
    .update({ scheduled_at: at.toISOString(), ...(post.status === "missed" ? { status: "approved", approved_at: new Date().toISOString() } : {}) })
    .eq("id", id);
  if (error) return { ok: false, message: "We couldn't move that post. Try again." };
  revalidatePath("/app", "layout");
  return { ok: true };
}
