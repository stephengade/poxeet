import { fromBytea, unseal } from "./crypto";
import { email } from "./email";
import { appUrl } from "./config";
import { publishPost, type PublishResult } from "./linkedin";
import { sendAccountNotice } from "./notify";
import { createAdminClient } from "./supabase/admin";

// The publisher (PRD section 12, PUB-1 to PUB-4, D-026). Server only, run by the cron route. Claims due approved
// posts exactly once (claim_due_posts), sends each to LinkedIn, and records the outcome following the failure
// table in PRD section 10. Never logs post text or tokens.

/** The most sends attempted for one post (PUB-3). */
export const MAX_ATTEMPTS = 3;

export type Outcome = {
  post: Record<string, unknown>;
  /** What happens to the member's LinkedIn connection. */
  connection?: "expired" | "needs_reconsent";
  /** Email the member: their post failed for good, or LinkedIn disconnected. */
  notify?: "failed" | "disconnected";
};

/** What a send result does to the post and the connection. Pure, so every row of the failure table is tested. */
export function decideOutcome(result: PublishResult, attempts: number, now = new Date()): Outcome {
  if (result.ok) {
    return { post: { status: "posted", posted_at: now.toISOString(), posted_via: "api", linkedin_post_urn: result.urn, last_error: null } };
  }
  switch (result.kind) {
    // Token revoked or expired: keep the post approved for after the member reconnects.
    case "auth": return { post: { status: "approved", attempts: Math.max(0, attempts - 1), last_error: result.message }, connection: "expired", notify: "disconnected" };
    case "permission": return { post: { status: "approved", attempts: Math.max(0, attempts - 1), last_error: result.message }, connection: "needs_reconsent", notify: "disconnected" };
    // LinkedIn refused the text: the member edits and approves again. No retry.
    case "content": return { post: { status: "failed", last_error: result.message }, notify: "failed" };
    // Temporary: try again on a later run, up to MAX_ATTEMPTS sends.
    case "rate":
    case "server":
      return attempts >= MAX_ATTEMPTS
        ? { post: { status: "failed", last_error: `${result.message} Gave up after ${MAX_ATTEMPTS} tries.` }, notify: "failed" }
        : { post: { status: "approved", last_error: result.message } };
    // The request may have reached LinkedIn: never send it again on our own (PRD: prevents duplicates).
    case "unknown": return { post: { status: "needs_check", last_error: `${result.message} Check LinkedIn to see whether it went out.` } };
  }
}

type Claimed = { id: string; user_id: string; content: string; attempts: number };
type Connection = { user_id: string; person_urn: string; ciphertext: string; iv: string; tag: string };

export type PublishSummary = { claimed: number; posted: number; retrying: number; failed: number; needsCheck: number; stuck: number };

/**
 * One publisher run: frees stuck sends, claims a batch of due posts and sends them, stopping before the time
 * budget runs out (unsent claims go back to approved). Safe to run concurrently or repeatedly.
 */
export async function publishDue(options: { limit?: number; budgetMs?: number; send?: typeof publishPost } = {}): Promise<PublishSummary> {
  const admin = createAdminClient();
  const started = Date.now();
  const budget = options.budgetMs ?? 25_000;
  const send = options.send ?? publishPost;
  const summary: PublishSummary = { claimed: 0, posted: 0, retrying: 0, failed: 0, needsCheck: 0, stuck: 0 };

  const { data: stuck } = await admin.rpc("release_stuck_posts");
  summary.stuck = Number(stuck ?? 0);

  const { data: claimed, error } = await admin.rpc("claim_due_posts", { p_limit: options.limit ?? 10 });
  if (error) throw new Error(`claim_due_posts failed: ${error.message}`);
  const posts = (claimed ?? []) as Claimed[];
  summary.claimed = posts.length;
  if (!posts.length) return summary;

  const { data: connections } = await admin.from("linkedin_connections").select("user_id, person_urn, ciphertext, iv, tag")
    .in("user_id", [...new Set(posts.map((post) => post.user_id))]);
  const byUser = new Map(((connections ?? []) as Connection[]).map((row) => [row.user_id, row]));
  const notified = new Set<string>();

  for (const post of posts) {
    // Out of time: hand the rest back untouched (attempts restored) for the next run.
    if (Date.now() - started > budget) {
      await admin.from("scheduled_posts").update({ status: "approved", attempts: Math.max(0, post.attempts - 1), claimed_at: null }).eq("id", post.id).eq("status", "posting");
      continue;
    }
    const connection = byUser.get(post.user_id);
    let result: PublishResult;
    if (!connection) {
      result = { ok: false, kind: "auth", status: null, message: "LinkedIn isn't connected. Reconnect LinkedIn to keep posting." };
    } else {
      let token: string | null = null;
      try {
        token = unseal({ ciphertext: fromBytea(connection.ciphertext), iv: fromBytea(connection.iv), tag: fromBytea(connection.tag) });
      } catch {
        result = { ok: false, kind: "auth", status: null, message: "We couldn't read the saved LinkedIn access. Reconnect LinkedIn." };
      }
      result ??= await send({ accessToken: token!, personUrn: connection.person_urn, text: post.content });
    }

    const outcome = decideOutcome(result, post.attempts);
    const { error: saveError } = await admin.from("scheduled_posts").update(outcome.post).eq("id", post.id).eq("status", "posting");
    if (saveError) console.error(`[publish] Couldn't record the result for post ${post.id}:`, saveError.message);
    const status = outcome.post.status;
    if (status === "posted") summary.posted++;
    else if (status === "approved") summary.retrying++;
    else if (status === "failed") summary.failed++;
    else if (status === "needs_check") summary.needsCheck++;
    if (!result.ok) console.warn(`[publish] Post ${post.id}: ${result.kind}${result.status ? ` (${result.status})` : ""}`);

    if (outcome.connection) await admin.from("linkedin_connections").update({ status: outcome.connection }).eq("user_id", post.user_id);
    if (outcome.notify === "disconnected" && !notified.has(post.user_id)) {
      notified.add(post.user_id);
      await sendAccountNotice(post.user_id, "linkedinDisconnected", { linkedinName: null }).catch(() => {});
    }
    if (outcome.notify === "failed") await notifyFailed(post, result.ok ? "" : result.message).catch(() => {});
  }
  return summary;
}

/** The "post failed" email, once per post (notifications dedupe). */
async function notifyFailed(post: Claimed, reason: string) {
  const admin = createAdminClient();
  const { error: claimed } = await admin.from("notifications").insert({ user_id: post.user_id, kind: "post_failed", dedupe_key: post.id });
  if (claimed) return;
  const { data: profile } = await admin.from("profiles").select("email, first_name").eq("id", post.user_id).maybeSingle();
  if (!profile?.email) return;
  const opening = post.content.split("\n").find((line) => line.trim())?.slice(0, 90) ?? "";
  const result = await email.sendSingle({
    to: profile.email, template: "postFailed", reference: `post-failed:${post.id}`,
    data: { firstName: profile.first_name, opening, reason, url: `${appUrl()}/app/posts/${post.id}` },
  });
  if (!result.ok) console.error("[publish] Failure email didn't send:", result.error);
}
