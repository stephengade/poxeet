import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deleteMemberData, DELETED_TABLES, exportMemberData } from "../lib/member-data";
import { admin, deleteUser, hasLocalSupabase, signedInUser, uniqueEmail } from "./helpers/local-supabase";

// Your data and Notifications against a local Supabase (D-030): the export holds only the member's rows, Delete my
// data empties exactly the listed tables for that member and keeps the account, and members set their own email switches.
describe.skipIf(!hasLocalSupabase)("member data", () => {
  type User = Awaited<ReturnType<typeof signedInUser>>;
  let a: User;
  let b: User;

  async function seed(user: string) {
    const db = admin();
    await db.from("profiles").update({ brief: { profession: "Engineer" } }).eq("id", user);
    await db.from("imported_posts").insert([{ user_id: user, source: "paste", text: `First ${user}`, text_hash: `h1-${user}` }, { user_id: user, source: "paste", text: `Second ${user}`, text_hash: `h2-${user}` }]);
    const { data: voice } = await db.from("voice_profiles").insert({ user_id: user, version: 1, profile: { schema_version: 1 }, origin: "generated", is_active: true }).select("id").single();
    const { data: calendar } = await db.from("calendars").insert({ user_id: user, start_date: "2026-10-26", days: 7, posts_per_week: 3, voice_profile_id: voice!.id }).select("id").single();
    await db.from("scheduled_posts").insert([
      { user_id: user, calendar_id: calendar!.id, content: "A draft", scheduled_at: "2026-10-26T09:00:00Z", status: "draft" },
      { user_id: user, content: "Already on LinkedIn", scheduled_at: "2026-10-19T09:00:00Z", status: "posted", posted_at: "2026-10-19T09:00:05Z", linkedin_post_urn: "urn:li:share:1" },
    ]);
    await db.from("voice_jobs").insert({ user_id: user, status: "done" });
    await db.from("linkedin_connections").insert({ user_id: user, person_urn: `urn:li:person:${user.slice(0, 8)}`, ciphertext: "\\x00", iv: "\\x00", tag: "\\x00", expires_at: "2027-01-01T00:00:00Z" });
    await db.from("notifications").insert({ user_id: user, kind: "empty_next_week", dedupe_key: "2026-10-26" });
  }

  const count = async (table: string, user: string) => (await admin().from(table).select("user_id", { count: "exact", head: true }).eq("user_id", user)).count ?? 0;

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SECRET_KEY", process.env.TEST_SUPABASE_SERVICE_KEY ?? "");
    vi.stubEnv("LINKEDIN_CLIENT_ID", "");
    a = await signedInUser(uniqueEmail("data-a"));
    b = await signedInUser(uniqueEmail("data-b"));
    await seed(a.id);
    await seed(b.id);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (a) await deleteUser(a.id);
    if (b) await deleteUser(b.id);
  });

  it("exports the member's own rows, read under their session", async () => {
    const file = await exportMemberData(a.client, a.id);
    expect(file.brief).toEqual({ profession: "Engineer" });
    expect(file.imported_posts.map((row) => row.text)).toEqual([`First ${a.id}`, `Second ${a.id}`]);
    expect(file.voice_versions).toHaveLength(1);
    expect(file.calendars).toHaveLength(1);
    expect(file.scheduled_posts.map((row) => row.status)).toEqual(["posted", "draft"]);
    // Another member's id reads nothing through RLS.
    await expect(exportMemberData(a.client, b.id)).rejects.toThrow();
  });

  it("can't be called by a member directly", async () => {
    const { error } = await a.client.rpc("delete_member_data", { p_user: b.id });
    expect(error).not.toBeNull();
  });

  it("deletes the listed tables for that member only, and keeps the account", async () => {
    const counts = await deleteMemberData(a.id);
    expect(counts).toEqual({ scheduled_posts: 2, calendars: 1, voice_profiles: 1, voice_jobs: 1, imported_posts: 2, linkedin_connections: 1 });
    for (const table of DELETED_TABLES) {
      expect(await count(table, a.id), table).toBe(0);
      expect(await count(table, b.id), table).toBeGreaterThan(0);
    }
    const { data: profile } = await admin().from("profiles").select("id, brief").eq("id", a.id).single();
    expect(profile).toEqual({ id: a.id, brief: {} });
    expect(await count("notifications", a.id)).toBe(1);
    const { data: other } = await admin().from("profiles").select("brief").eq("id", b.id).single();
    expect(other!.brief).toEqual({ profession: "Engineer" });
  });

  it("lets members change their own email switches, and only their own", async () => {
    await a.client.from("profiles").update({ email_empty_week: false }).eq("id", a.id);
    await a.client.from("profiles").update({ email_empty_week: false }).eq("id", b.id);
    const { data } = await admin().from("profiles").select("id, email_empty_week, email_linkedin_expiring").in("id", [a.id, b.id]);
    expect(data!.find((row) => row.id === a.id)).toMatchObject({ email_empty_week: false, email_linkedin_expiring: true });
    expect(data!.find((row) => row.id === b.id)).toMatchObject({ email_empty_week: true });
  });
});
