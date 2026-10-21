import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUser, hasLocalSupabase, signedInUser, uniqueEmail } from "./helpers/local-supabase";

// Calendars and drafted posts against a local Supabase: a retried week never doubles posts (D-025).
describe.skipIf(!hasLocalSupabase)("calendar drafts", () => {
  type User = Awaited<ReturnType<typeof signedInUser>>;
  let a: User;
  let calendarId: string;

  beforeAll(async () => {
    a = await signedInUser(uniqueEmail("plan-a"));
    const { data } = await admin().from("calendars").insert({ user_id: a.id, start_date: "2026-10-26", days: 7, posts_per_week: 3, status: "drafting", weeks_total: 1 }).select("id").single();
    calendarId = data!.id;
  });

  afterAll(async () => {
    if (a) await deleteUser(a.id);
  });

  const row = (slot: number, content: string) => ({
    user_id: a.id, calendar_id: calendarId, slot_index: slot, scheduled_at: "2026-10-26T08:00:00Z", status: "draft", content,
  });

  it("keeps the first draft of a slot when the same week is drafted again", async () => {
    const first = await admin().from("scheduled_posts").upsert([row(0, "First draft"), row(1, "Second slot")], { onConflict: "calendar_id,slot_index", ignoreDuplicates: true }).select("id");
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(2);
    const again = await admin().from("scheduled_posts").upsert([row(0, "A retry"), row(2, "Third slot")], { onConflict: "calendar_id,slot_index", ignoreDuplicates: true }).select("id");
    expect(again.error).toBeNull();
    expect(again.data).toHaveLength(1);
    const { data } = await a.client.from("scheduled_posts").select("slot_index, content").eq("calendar_id", calendarId).order("slot_index");
    expect(data).toEqual([{ slot_index: 0, content: "First draft" }, { slot_index: 1, content: "Second slot" }, { slot_index: 2, content: "Third slot" }]);
  });

  it("lets posts without a slot (written by hand) sit side by side", async () => {
    const { error } = await admin().from("scheduled_posts").insert([
      { user_id: a.id, scheduled_at: "2026-10-27T08:00:00Z", content: "Mine, one" },
      { user_id: a.id, scheduled_at: "2026-10-28T08:00:00Z", content: "Mine, two" },
    ]);
    expect(error).toBeNull();
  });

  it("lets the member approve their own draft", async () => {
    const { data: post } = await a.client.from("scheduled_posts").select("id").eq("slot_index", 0).eq("calendar_id", calendarId).single();
    const approved = await a.client.from("scheduled_posts").update({ status: "approved" }).eq("id", post!.id).select("status");
    expect(approved.data?.[0]?.status).toBe("approved");
  });
});
