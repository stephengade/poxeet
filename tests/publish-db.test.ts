import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seal, toBytea } from "../lib/crypto";
import type { PublishResult } from "../lib/linkedin";
import { publishDue } from "../lib/publish";
import { admin, deleteUser, hasLocalSupabase, signedInUser, uniqueEmail } from "./helpers/local-supabase";

// The publisher against a local Supabase (PRD PUB-1 to PUB-4, D-026), with LinkedIn faked: claiming exactly once,
// who gets skipped, the clean-up jobs, the member status guard, and a full run.
describe.skipIf(!hasLocalSupabase)("publishing", () => {
  type User = Awaited<ReturnType<typeof signedInUser>>;
  let a: User;
  let b: User;
  const past = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  beforeAll(async () => {
    // publishDue uses the app's admin client: point it at the local Supabase, with a test encryption key.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SECRET_KEY", process.env.TEST_SUPABASE_SERVICE_KEY ?? "");
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("ZOHO_API_KEY", "");
    a = await signedInUser(uniqueEmail("pub-a"));
    b = await signedInUser(uniqueEmail("pub-b"));
    const token = seal("li-token");
    const connection = (user: string, status = "active", expires = future) => ({
      user_id: user, person_urn: `urn:li:person:${user.slice(0, 8)}`, ciphertext: toBytea(token.ciphertext), iv: toBytea(token.iv), tag: toBytea(token.tag),
      expires_at: expires, status,
    });
    await admin().from("linkedin_connections").insert([connection(a.id), connection(b.id, "expired")]);
  });

  beforeEach(async () => {
    await admin().from("scheduled_posts").delete().in("user_id", [a.id, b.id]);
    await admin().from("profiles").update({ paused: false }).in("id", [a.id, b.id]);
    await admin().from("linkedin_connections").update({ status: "active" }).eq("user_id", a.id);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (a) await deleteUser(a.id);
    if (b) await deleteUser(b.id);
  });

  const post = (user: string, values: Record<string, unknown> = {}) => ({
    user_id: user, content: "A post", scheduled_at: past(5), status: "approved", ...values,
  });
  const insert = async (rows: Array<Record<string, unknown>>) => (await admin().from("scheduled_posts").insert(rows).select("id")).data!.map((row) => row.id as string);

  it("claims a due post exactly once, even when two runs overlap", async () => {
    await insert([post(a.id)]);
    const [first, second] = await Promise.all([admin().rpc("claim_due_posts", { p_limit: 10 }), admin().rpc("claim_due_posts", { p_limit: 10 })]);
    expect((first.data ?? []).length + (second.data ?? []).length).toBe(1);
    const { data } = await admin().from("scheduled_posts").select("status, attempts").eq("user_id", a.id).single();
    expect(data).toEqual({ status: "posting", attempts: 1 });
  });

  it("skips drafts, posts not yet due, paused members and expired connections", async () => {
    await insert([post(a.id, { status: "draft" }), post(a.id, { scheduled_at: future }), post(b.id)]);
    expect((await admin().rpc("claim_due_posts", { p_limit: 10 })).data).toEqual([]);
    await insert([post(a.id)]);
    await admin().from("profiles").update({ paused: true }).eq("id", a.id);
    expect((await admin().rpc("claim_due_posts", { p_limit: 10 })).data).toEqual([]);
  });

  it("flags sends stuck for 10 minutes and marks posts over a day late as missed", async () => {
    const [stuck] = await insert([post(a.id, { status: "posting", claimed_at: past(11), attempts: 1 })]);
    const [late] = await insert([post(a.id, { scheduled_at: past(25 * 60) })]);
    expect((await admin().rpc("release_stuck_posts")).data).toBeGreaterThanOrEqual(1);
    expect((await admin().rpc("mark_missed_posts")).data).toBeGreaterThanOrEqual(1);
    const { data } = await admin().from("scheduled_posts").select("id, status").in("id", [stuck, late]);
    expect(Object.fromEntries((data ?? []).map((row) => [row.id, row.status]))).toEqual({ [stuck]: "needs_check", [late]: "missed" });
  });

  it("lets members make only the moves in the PRD's post state table", async () => {
    const [id] = await insert([post(a.id, { status: "draft" })]);
    const update = (values: Record<string, unknown>) => a.client.from("scheduled_posts").update(values).eq("id", id).select("status");
    expect((await update({ status: "posting" })).error).not.toBeNull();
    expect((await update({ status: "posted" })).error).not.toBeNull(); // only "by hand"
    expect((await update({ attempts: 3 })).error).not.toBeNull();
    expect((await update({ status: "posted", posted_via: "manual" })).data?.[0]?.status).toBe("posted");
    expect((await update({ content: "Changed after posting" })).error).not.toBeNull();
    const [sending] = await insert([post(a.id, { status: "posting" })]);
    expect((await a.client.from("scheduled_posts").update({ content: "x" }).eq("id", sending).select("id")).error).not.toBeNull();
    expect((await a.client.from("scheduled_posts").insert({ user_id: a.id, content: "Mine", scheduled_at: future, status: "posted" })).error).not.toBeNull();
  });

  it("sends due posts and records each outcome", async () => {
    const [sent, retry, refused, unknown] = await insert(["sent", "retry", "refused", "unknown"].map((content) => post(a.id, { content })));
    // The fake LinkedIn answers by post text: claims come back in any order when posts share a time.
    const results: Record<string, PublishResult> = {
      sent: { ok: true, urn: "urn:li:share:1" },
      retry: { ok: false, kind: "server", status: 503, message: "LinkedIn had a problem." },
      refused: { ok: false, kind: "content", status: 422, message: "LinkedIn didn't accept this post." },
      unknown: { ok: false, kind: "unknown", status: null, message: "No answer." },
    };
    const order = [sent, retry, refused, unknown];
    const send = vi.fn(async (input: { accessToken: string; text: string }) => {
      expect(input.accessToken).toBe("li-token");
      return results[input.text];
    });
    const summary = await publishDue({ send });
    expect(summary).toMatchObject({ claimed: 4, posted: 1, retrying: 1, failed: 1, needsCheck: 1 });
    const { data } = await admin().from("scheduled_posts").select("id, status, linkedin_post_urn, posted_via").in("id", order);
    const byId = Object.fromEntries((data ?? []).map((row) => [row.id, row]));
    expect(byId[sent]).toMatchObject({ status: "posted", linkedin_post_urn: "urn:li:share:1", posted_via: "api" });
    expect(byId[retry].status).toBe("approved");
    expect(byId[refused].status).toBe("failed");
    expect(byId[unknown].status).toBe("needs_check");
    // A second run finds nothing new to send: nothing goes out twice.
    expect((await publishDue({ send })).posted).toBe(0);
  });

  it("expires the connection on 401 and keeps the post for after the member reconnects", async () => {
    const [id] = await insert([post(a.id)]);
    await publishDue({ send: async () => ({ ok: false, kind: "auth", status: 401, message: "LinkedIn access ended." }) });
    const [{ data: row }, { data: connection }] = await Promise.all([
      admin().from("scheduled_posts").select("status, attempts").eq("id", id).single(),
      admin().from("linkedin_connections").select("status").eq("user_id", a.id).single(),
    ]);
    expect(row).toEqual({ status: "approved", attempts: 0 });
    expect(connection?.status).toBe("expired");
  });
});
