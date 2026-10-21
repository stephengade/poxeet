import { describe, expect, it } from "vitest";
import { emptyNextWeek, summarizeWeek } from "../lib/digest";

// The empty-next-week check and the weekly summary, without a database.

const slots = [{ day: "mon" as const, time: "09:00" }, { day: "wed" as const, time: "09:00" }, { day: "fri" as const, time: "09:00" }];

describe("emptyNextWeek", () => {
  it("warns from Thursday when next week has nothing approved", () => {
    // Thursday 22 October 2026, Lagos.
    expect(emptyNextWeek({ now: new Date("2026-10-22T10:00:00Z"), timeZone: "Africa/Lagos", slots, readyDates: [] }))
      .toEqual({ weekStart: "2026-10-26", weekLabel: "the week of 26 October", openSlots: 3 });
  });

  it("stays quiet earlier in the week", () => {
    expect(emptyNextWeek({ now: new Date("2026-10-20T10:00:00Z"), timeZone: "Africa/Lagos", slots, readyDates: [] })).toBeNull();
  });

  it("stays quiet when next week already has an approved post", () => {
    expect(emptyNextWeek({ now: new Date("2026-10-23T10:00:00Z"), timeZone: "Africa/Lagos", slots, readyDates: ["2026-10-28"] })).toBeNull();
  });

  it("counts a post approved for this week as no help for next week", () => {
    expect(emptyNextWeek({ now: new Date("2026-10-23T10:00:00Z"), timeZone: "Africa/Lagos", slots, readyDates: ["2026-10-23"] })?.openSlots).toBe(3);
  });

  it("uses the member's own day: late Wednesday in UTC is already Thursday in Tokyo", () => {
    expect(emptyNextWeek({ now: new Date("2026-10-21T20:00:00Z"), timeZone: "Asia/Tokyo", slots, readyDates: [] })?.weekStart).toBe("2026-10-26");
    expect(emptyNextWeek({ now: new Date("2026-10-21T20:00:00Z"), timeZone: "UTC", slots, readyDates: [] })).toBeNull();
  });

  it("does nothing for members without posting days", () => {
    expect(emptyNextWeek({ now: new Date("2026-10-22T10:00:00Z"), timeZone: "UTC", slots: [], readyDates: [] })).toBeNull();
  });
});

describe("summarizeWeek", () => {
  // Monday 26 October 2026: last week is 19 to 25 October, this week 26 October to 1 November.
  const monday = new Date("2026-10-26T08:00:00Z");
  const post = (status: string, scheduled_at: string, content = "") => ({ status, scheduled_at, posted_at: status === "posted" ? scheduled_at : null, content });

  it("counts last week's posts and this week's approved posts and drafts", () => {
    const posts = [
      post("posted", "2026-10-22T09:00:00Z", "Second post\nbody"),
      post("posted", "2026-10-19T09:00:00Z", "\nFirst post"),
      post("missed", "2026-10-23T09:00:00Z"),
      post("posted", "2026-10-12T09:00:00Z", "Two weeks ago"),
      post("approved", "2026-10-27T09:00:00Z"),
      post("approved", "2026-11-02T09:00:00Z"),
      post("draft", "2026-10-29T09:00:00Z"),
    ];
    expect(summarizeWeek({ now: monday, timeZone: "UTC", posts })).toEqual({
      weekStart: "2026-10-26", weekLabel: "the week of 26 October", posted: 2, notPosted: 1, openings: ["First post", "Second post"], approved: 1, drafts: 1,
    });
  });

  it("only runs on the member's Monday", () => {
    const posts = [post("approved", "2026-10-27T09:00:00Z")];
    expect(summarizeWeek({ now: new Date("2026-10-27T08:00:00Z"), timeZone: "UTC", posts })).toBeNull();
    // Late Sunday in UTC is already Monday in Tokyo.
    expect(summarizeWeek({ now: new Date("2026-10-25T20:00:00Z"), timeZone: "Asia/Tokyo", posts })?.weekStart).toBe("2026-10-26");
  });

  it("stays quiet when there's nothing to say", () => {
    expect(summarizeWeek({ now: monday, timeZone: "UTC", posts: [] })).toBeNull();
  });
});
