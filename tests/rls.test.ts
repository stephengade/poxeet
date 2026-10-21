import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, deleteUser, hasLocalSupabase, signedInUser, uniqueEmail } from "./helpers/local-supabase";

// AC-1 (database side), AC-2 and AC-22 from the PRD, against a local Supabase.
describe.skipIf(!hasLocalSupabase)("row level security and sign-up rules", () => {
  type User = Awaited<ReturnType<typeof signedInUser>>;
  let a: User;
  let b: User;
  let bPostId: string;
  let bVoiceId: string;
  let bCalendarId: string;
  let signupMode: string;
  const setSignupMode = (mode: string) => admin().from("instance_settings").update({ signup_mode: mode }).eq("id", true);

  beforeAll(async () => {
    const settings = await admin().from("instance_settings").select("signup_mode").eq("id", true).single();
    signupMode = settings.data!.signup_mode;
    a = await signedInUser(uniqueEmail("member-a"));
    b = await signedInUser(uniqueEmail("member-b"));
    const db = admin();
    const voice = await db.from("voice_profiles").insert({ user_id: b.id, version: 1, profile: { schema_version: 1 }, origin: "generated", is_active: true }).select("id").single();
    const calendar = await db.from("calendars").insert({ user_id: b.id, start_date: "2026-11-02", days: 30, posts_per_week: 3 }).select("id").single();
    const post = await db.from("scheduled_posts").insert({ user_id: b.id, calendar_id: calendar.data!.id, content: "B's private draft", scheduled_at: "2026-11-02T08:00:00Z" }).select("id").single();
    await db.from("imported_posts").insert({ user_id: b.id, source: "paste", text: "B's old post", text_hash: "b-hash" });
    await db.from("linkedin_connections").insert({ user_id: b.id, person_urn: "urn:li:person:b", ciphertext: "\\x00", iv: "\\x00", tag: "\\x00", expires_at: "2026-12-01T00:00:00Z" });
    bVoiceId = voice.data!.id;
    bCalendarId = calendar.data!.id;
    bPostId = post.data!.id;
  });

  afterAll(async () => {
    if (signupMode) await setSignupMode(signupMode);
    if (a) await deleteUser(a.id);
    if (b) await deleteUser(b.id);
  });

  describe("AC-1: sign-up", () => {
    it("gives a new account a member profile with no AI access", async () => {
      const { data } = await a.client.from("profiles").select("role, master_key_access, account_status, posting_slots").eq("id", a.id).single();
      expect(data).toMatchObject({ role: "member", master_key_access: "none", account_status: "active" });
      expect(data!.posting_slots).toHaveLength(3);
    });

    it("refuses an email that is not on the access list when the instance is invite-only", async () => {
      await setSignupMode("invite_only");
      const { error } = await admin().auth.admin.createUser({ email: uniqueEmail("stranger"), password: "Test-password-1", email_confirm: true });
      expect(error).not.toBeNull();
      await setSignupMode(signupMode);
    });

    it("lets an access-list email in when invite-only, with the role and access the list assigns", async () => {
      const email = uniqueEmail("invited");
      await setSignupMode("invite_only");
      await admin().from("allowlist").insert({ email, role: "member", master_key_access: "granted" });
      const invited = await signedInUser(email);
      await setSignupMode(signupMode);
      const { data } = await invited.client.from("profiles").select("master_key_access").eq("id", invited.id).single();
      expect(data!.master_key_access).toBe("granted");
      await deleteUser(invited.id);
      await admin().from("allowlist").delete().eq("email", email);
    });
  });

  describe("AC-2: one member can't see or change another's data", () => {
    it("shows B their own rows (control: the empty reads below aren't a broken setup)", async () => {
      for (const table of ["voice_profiles", "calendars", "scheduled_posts", "imported_posts"] as const) {
        const { data } = await b.client.from(table).select("id").eq("user_id", b.id);
        expect(data?.length, table).toBeGreaterThan(0);
      }
    });

    it("returns nothing of B's when A reads", async () => {
      for (const table of ["profiles", "voice_profiles", "calendars", "scheduled_posts", "imported_posts"] as const) {
        const column = table === "profiles" ? "id" : "user_id";
        const { data, error } = await a.client.from(table).select(column).eq(column, b.id);
        expect(error, table).toBeNull();
        expect(data, table).toEqual([]);
      }
    });

    it("never exposes connections or keys to any member", async () => {
      const own = await b.client.from("linkedin_connections").select("*");
      const other = await a.client.from("linkedin_connections").select("*");
      expect(own.data ?? []).toEqual([]);
      expect(other.data ?? []).toEqual([]);
      const keys = await b.client.from("user_api_keys").select("*");
      expect(keys.data ?? []).toEqual([]);
    });

    it("changes nothing when A updates or deletes B's rows", async () => {
      await a.client.from("scheduled_posts").update({ content: "Taken over" }).eq("id", bPostId);
      await a.client.from("scheduled_posts").delete().eq("id", bPostId);
      await a.client.from("calendars").delete().eq("id", bCalendarId);
      await a.client.from("voice_profiles").update({ is_active: false }).eq("id", bVoiceId);
      const post = await admin().from("scheduled_posts").select("content").eq("id", bPostId).single();
      const calendar = await admin().from("calendars").select("id").eq("id", bCalendarId).single();
      const voice = await admin().from("voice_profiles").select("is_active").eq("id", bVoiceId).single();
      expect(post.data!.content).toBe("B's private draft");
      expect(calendar.data).not.toBeNull();
      expect(voice.data!.is_active).toBe(true);
    });

    it("refuses rows A writes in B's name", async () => {
      const { error } = await a.client.from("imported_posts").insert({ user_id: b.id, source: "paste", text: "Planted", text_hash: "planted" });
      expect(error).not.toBeNull();
    });

    it("gives a signed-out visitor nothing", async () => {
      const { data } = await anon().from("scheduled_posts").select("*");
      expect(data ?? []).toEqual([]);
    });

    it("refuses every direct write from a signed-out visitor", async () => {
      const post = await anon().from("scheduled_posts").insert({ user_id: b.id, content: "Planted", scheduled_at: "2026-11-02T08:00:00Z" });
      const profile = await anon().from("profiles").update({ paused: true }).eq("id", b.id);
      expect(post.error).not.toBeNull();
      expect(profile.error).not.toBeNull();
    });

    it("shows A none of B's job status, usage, notifications or credits", async () => {
      const db = admin();
      await db.from("voice_jobs").upsert({ user_id: b.id, status: "done" });
      await db.from("generation_usage").insert({ user_id: b.id, job: "draft", model: "test" });
      await db.from("notifications").insert({ user_id: b.id, kind: "test", dedupe_key: crypto.randomUUID() });
      await db.from("credit_ledger").insert({ user_id: b.id, delta: 5, kind: "grant", reference: `rls-${crypto.randomUUID()}` });
      for (const table of ["voice_jobs", "generation_usage", "notifications", "credit_ledger", "checkout_sessions"] as const) {
        const own = await b.client.from(table).select("user_id").eq("user_id", b.id);
        const other = await a.client.from(table).select("user_id").eq("user_id", b.id);
        if (table !== "checkout_sessions") expect(own.data?.length, table).toBeGreaterThan(0);
        expect(other.data ?? [], table).toEqual([]);
      }
    });

    it("won't let A hand their own post to B or file it under B's calendar", async () => {
      const own = await admin().from("scheduled_posts").insert({ user_id: a.id, content: "A's draft", scheduled_at: "2026-11-04T08:00:00Z" }).select("id").single();
      const moved = await a.client.from("scheduled_posts").update({ user_id: b.id }).eq("id", own.data!.id);
      const filed = await a.client.from("scheduled_posts").update({ calendar_id: bCalendarId }).eq("id", own.data!.id);
      const planted = await a.client.from("scheduled_posts").insert({ user_id: a.id, calendar_id: bCalendarId, content: "Into B's plan", scheduled_at: "2026-11-04T08:00:00Z" });
      expect(moved.error).not.toBeNull();
      expect(filed.error).not.toBeNull();
      expect(planted.error).not.toBeNull();
      const row = await admin().from("scheduled_posts").select("user_id, calendar_id").eq("id", own.data!.id).single();
      expect(row.data).toEqual({ user_id: a.id, calendar_id: null });
    });
  });

  describe("server-managed calendars", () => {
    it("lets a member read their calendar but not create one or rewrite its plan", async () => {
      const read = await b.client.from("calendars").select("id").eq("id", bCalendarId);
      expect(read.data).toHaveLength(1);
      const created = await b.client.from("calendars").insert({ user_id: b.id, start_date: "2026-11-02", days: 7, posts_per_week: 3, status: "failed" });
      expect(created.error).not.toBeNull();
      const plan = Array.from({ length: 500 }, (_, index) => ({ index, week: 0, topic_angle: "x", scheduledAt: "2026-11-02T08:00:00Z" }));
      const rewritten = await b.client.from("calendars").update({ plan, status: "failed", weeks_total: 500 }).eq("id", bCalendarId);
      expect(rewritten.error).not.toBeNull();
      const row = await admin().from("calendars").select("plan, weeks_total").eq("id", bCalendarId).single();
      expect(row.data).toEqual({ plan: [], weeks_total: 0 });
    });
  });

  describe("AC-22: members can't write admin or billing state", () => {
    it("refuses changes to their own admin fields", async () => {
      for (const change of [{ role: "admin" }, { master_key_access: "granted" }, { account_status: "suspended" }, { daily_generation_cap: 999 }]) {
        const { error } = await a.client.from("profiles").update(change).eq("id", a.id);
        expect(error, JSON.stringify(change)).not.toBeNull();
      }
      const { error } = await a.client.from("profiles").update({ timezone: "Africa/Lagos" }).eq("id", a.id);
      expect(error).toBeNull();
    });

    it("refuses direct writes to the credit ledger and checkout sessions", async () => {
      const ledger = await a.client.from("credit_ledger").insert({ user_id: a.id, delta: 1000, kind: "grant", reference: "self-grant" });
      expect(ledger.error).not.toBeNull();
      const pack = await admin().from("credit_packs").insert({ name: "Test", credits: 100, price_amount: 5, currency: "USD", bachs_product_id: `prod_${crypto.randomUUID()}` }).select("id").single();
      const checkout = await a.client.from("checkout_sessions").insert({ user_id: a.id, pack_id: pack.data!.id, bachs_checkout_id: "fake", credits: 100, amount: 5, currency: "USD", status: "paid" });
      expect(checkout.error).not.toBeNull();
      await admin().from("credit_packs").delete().eq("id", pack.data!.id);
    });

    it("refuses calls to the credit functions", async () => {
      const grant = await a.client.rpc("grant_credits", { p_user: a.id, p_amount: 1000, p_reference: "self", p_note: null });
      expect(grant.error).not.toBeNull();
      const reserve = await a.client.rpc("reserve_credits", { p_user: a.id, p_amount: 1, p_job_id: "job" });
      expect(reserve.error).not.toBeNull();
    });

    it("stops a member's own post from being marked as sent", async () => {
      const own = await admin().from("scheduled_posts").insert({ user_id: a.id, content: "A's draft", scheduled_at: "2026-11-03T08:00:00Z" }).select("id").single();
      const { error } = await a.client.from("scheduled_posts").update({ status: "posted" }).eq("id", own.data!.id);
      expect(error).not.toBeNull();
    });
  });

  describe("suspension", () => {
    it("cuts a suspended member off from their content", async () => {
      await admin().from("profiles").update({ account_status: "suspended" }).eq("id", b.id);
      const { data } = await b.client.from("scheduled_posts").select("id");
      expect(data).toEqual([]);
      const { data: active } = await b.client.rpc("is_active_member");
      expect(active).toBe(false);
      await admin().from("profiles").update({ account_status: "active" }).eq("id", b.id);
    });
  });
});

describe.skipIf(!hasLocalSupabase)("credit functions", () => {
  let userId: string;
  beforeAll(async () => { userId = (await signedInUser(uniqueEmail("credits"))).id; });
  afterAll(async () => { if (userId) await deleteUser(userId); });

  it("holds, settles once and never overdraws", async () => {
    const db = admin();
    const job = `job-${crypto.randomUUID()}`;
    await db.rpc("grant_credits", { p_user: userId, p_amount: 100, p_reference: `grant-${job}`, p_note: "test" });
    expect((await db.rpc("reserve_credits", { p_user: userId, p_amount: 500, p_job_id: `${job}-big` })).data).toBe(false);
    expect((await db.rpc("reserve_credits", { p_user: userId, p_amount: 60, p_job_id: job })).data).toBe(true);
    expect((await db.rpc("credit_balance", { p_user: userId })).data).toBe(40);
    await db.rpc("settle_credits", { p_job_id: job, p_actual: 25 });
    await db.rpc("settle_credits", { p_job_id: job, p_actual: 25 });
    expect((await db.rpc("credit_balance", { p_user: userId })).data).toBe(75);
  });
});
