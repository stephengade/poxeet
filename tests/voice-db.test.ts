import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUser, hasLocalSupabase, signedInUser, uniqueEmail } from "./helpers/local-supabase";

// Saving voice profile versions and the analysis status table, against a local Supabase.
describe.skipIf(!hasLocalSupabase)("voice profiles and analysis status", () => {
  type User = Awaited<ReturnType<typeof signedInUser>>;
  let a: User;
  let b: User;

  beforeAll(async () => {
    a = await signedInUser(uniqueEmail("voice-a"));
    b = await signedInUser(uniqueEmail("voice-b"));
  });

  afterAll(async () => {
    if (a) await deleteUser(a.id);
    if (b) await deleteUser(b.id);
  });

  const save = (user: string, summary: string) =>
    admin().rpc("save_voice_profile", { p_user: user, p_profile: { schema_version: 1, summary }, p_origin: "generated", p_post_count: 3, p_model: "test" });

  it("numbers versions and keeps exactly one active, without overwriting history", async () => {
    expect((await save(a.id, "first")).data).toBe(1);
    expect((await save(a.id, "second")).data).toBe(2);
    const { data } = await a.client.from("voice_profiles").select("version, is_active, profile").order("version");
    expect(data?.map((row) => [row.version, row.is_active])).toEqual([[1, false], [2, true]]);
    expect((data?.[0].profile as { summary: string }).summary).toBe("first");
  });

  it("refuses an unknown origin", async () => {
    const { error } = await admin().rpc("save_voice_profile", { p_user: a.id, p_profile: { schema_version: 1 }, p_origin: "made_up", p_post_count: 0, p_model: null });
    expect(error?.code).toBe("22023");
  });

  it("can't be called by a member", async () => {
    const { error } = await a.client.rpc("save_voice_profile", { p_user: a.id, p_profile: { schema_version: 1 }, p_origin: "generated", p_post_count: 0, p_model: null });
    expect(error).not.toBeNull();
  });

  it("shows a member only their own analysis status, and members can't write it", async () => {
    await admin().from("voice_jobs").upsert([{ user_id: a.id, status: "running" }, { user_id: b.id, status: "failed", reason: "no_credits", message: "Out" }]);
    const { data: mine } = await a.client.from("voice_jobs").select("user_id, status");
    expect(mine).toEqual([{ user_id: a.id, status: "running" }]);
    const { error } = await a.client.from("voice_jobs").update({ status: "done" }).eq("user_id", a.id);
    const { data: still } = await admin().from("voice_jobs").select("status").eq("user_id", a.id).single();
    expect(error !== null || still?.status === "running").toBe(true);
    expect(still?.status).toBe("running");
  });
});
