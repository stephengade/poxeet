import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUser, hasLocalSupabase, signedInUser, uniqueEmail } from "./helpers/local-supabase";

// Which model and provider the shared key runs on is a business secret (D-034, 202610210002_hide_models.sql): a
// member reads their own usage and voice versions, but never the model or provider columns.
describe.skipIf(!hasLocalSupabase)("hidden models", () => {
  type User = Awaited<ReturnType<typeof signedInUser>>;
  let member: User;

  beforeAll(async () => {
    member = await signedInUser(uniqueEmail("hidden-model"));
    const db = admin();
    await db.from("generation_usage").insert({ user_id: member.id, job: "draft", model: "secret-model", provider: "deepseek", input_tokens: 10, output_tokens: 10 });
    await db.rpc("save_voice_profile", { p_user: member.id, p_profile: { schema_version: 1 }, p_origin: "generated", p_post_count: 5, p_model: "secret-model" });
  });

  afterAll(async () => {
    await deleteUser(member.id);
  });

  it("lets a member read their usage and voice versions without the model", async () => {
    const usage = await member.client.from("generation_usage").select("job, input_tokens, credits_charged").eq("user_id", member.id);
    const voice = await member.client.from("voice_profiles").select("version, origin").eq("user_id", member.id);
    expect(usage.data).toHaveLength(1);
    expect(voice.data).toHaveLength(1);
  });

  it("refuses the model and provider columns, and select *", async () => {
    for (const query of [
      member.client.from("generation_usage").select("model"),
      member.client.from("generation_usage").select("provider"),
      member.client.from("generation_usage").select("*"),
      member.client.from("voice_profiles").select("model"),
      member.client.from("voice_profiles").select("*"),
    ]) {
      const { data, error } = await query;
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }
  });
});
