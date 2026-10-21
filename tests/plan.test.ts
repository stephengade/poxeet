import { describe, expect, it } from "vitest";
import { readBrief } from "../lib/brief";
import { parseDraft, searchTerms } from "../lib/plan/drafter";
import { parsePlan } from "../lib/plan/planner";
import { pickExamples } from "../lib/plan/run";
import { localParts, mondayOf, planSlots, zonedToUtc } from "../lib/plan/slots";

// Planning without a network or a database: slot dates and timezones, plan and draft validation, examples.

describe("zonedToUtc and localParts", () => {
  it("turns a local time into the right instant, across daylight saving", () => {
    expect(zonedToUtc("2026-10-19", "09:00", "Africa/Lagos").toISOString()).toBe("2026-10-19T08:00:00.000Z");
    expect(zonedToUtc("2026-07-01", "09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "Europe/London").toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(zonedToUtc("2026-11-02", "09:00", "America/New_York").toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("reads an instant back as local date and time", () => {
    expect(localParts(new Date("2026-10-19T23:30:00Z"), "Asia/Tokyo")).toEqual({ date: "2026-10-20", time: "08:30" });
    expect(mondayOf("2026-10-22")).toBe("2026-10-19");
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
  });
});

describe("planSlots", () => {
  const slots = [{ day: "mon" as const, time: "09:00" }, { day: "wed" as const, time: "09:00" }, { day: "fri" as const, time: "17:30" }];

  it("lists the member's posting slots for each week, in order, numbered", () => {
    const plan = planSlots({ startDate: "2026-10-19", weeks: 2, slots, timeZone: "Africa/Lagos", now: new Date("2026-10-01T00:00:00Z") });
    expect(plan.map((slot) => `${slot.date} ${slot.time} w${slot.week}`)).toEqual([
      "2026-10-19 09:00 w0", "2026-10-21 09:00 w0", "2026-10-23 17:30 w0",
      "2026-10-26 09:00 w1", "2026-10-28 09:00 w1", "2026-10-30 17:30 w1",
    ]);
    expect(plan.map((slot) => slot.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(plan[2].scheduledAt).toBe("2026-10-23T16:30:00.000Z");
    expect(plan[0].weekday).toBe("Monday");
  });

  it("skips slots already in the past", () => {
    const plan = planSlots({ startDate: "2026-10-19", weeks: 1, slots, timeZone: "UTC", now: new Date("2026-10-21T12:00:00Z") });
    expect(plan.map((slot) => slot.date)).toEqual(["2026-10-23"]);
  });
});

describe("parsePlan", () => {
  const slots = planSlots({ startDate: "2026-10-19", weeks: 1, slots: [{ day: "mon", time: "09:00" }, { day: "thu", time: "09:00" }], timeZone: "UTC", now: new Date("2026-10-01T00:00:00Z") });
  const answer = {
    pillars: [{ name: "Shipping", why: "Core expertise" }],
    slots: [
      { index: 0, pillar: "Shipping", post_type: "story", topic_angle: "The week we shipped a feature nobody asked for" },
      { index: 1, pillar: "Shipping", post_type: "opinion", topic_angle: "Why roadmaps should fit on one page" },
    ],
  };

  it("merges the planner's choices into the fixed slots", () => {
    const parsed = parsePlan(JSON.stringify(answer), slots);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.plan[1]).toMatchObject({ date: "2026-10-22", post_type: "opinion", topic_angle: "Why roadmaps should fit on one page" });
      expect(parsed.pillars).toHaveLength(1);
    }
  });

  it("rejects a missing slot or an unknown post type", () => {
    const missing = parsePlan(JSON.stringify({ ...answer, slots: answer.slots.slice(0, 1) }), slots);
    expect(!missing.ok && missing.problem).toMatch(/missing/);
    const badType = parsePlan(JSON.stringify({ ...answer, slots: [{ ...answer.slots[0], post_type: "meme" }, answer.slots[1]] }), slots);
    expect(badType.ok).toBe(false);
  });
});

describe("parseDraft", () => {
  it("accepts a draft, fills the hook and strips markdown emphasis", () => {
    const parsed = parseDraft(JSON.stringify({ text: "**Most roadmaps are wishlists.**\n\nShip one thing a week and learn more than any plan.", rationale: "Fits the goal.", needs_user_input: null, flags: [] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.draft.text.startsWith("Most roadmaps")).toBe(true);
      expect(parsed.draft.hook).toBe("Most roadmaps are wishlists.");
    }
  });

  it("rejects text over LinkedIn's limit and non-JSON", () => {
    expect(parseDraft(JSON.stringify({ text: "x".repeat(3001) })).ok).toBe(false);
    expect(parseDraft("Sure! Here's a post.").ok).toBe(false);
  });
});

describe("examples", () => {
  it("picks words from an angle, without stop words", () => {
    expect(searchTerms("Why we stopped estimating in story points")).toEqual(["estimating", "stopped", "points", "story"]);
  });

  it("prefers posts sharing words with the angle, then the longest", () => {
    const posts = [
      { id: "1", text: "Estimating in story points wasted our time." },
      { id: "2", text: "A very long post about hiring and teams and culture and many other things that matter." },
      { id: "3", text: "Short one." },
    ];
    expect(pickExamples(posts, "Why we stopped estimating in story points", 2)).toEqual([posts[0].text, posts[1].text]);
  });
});

describe("readBrief", () => {
  it("fills an empty or old brief with defaults", () => {
    expect(readBrief({})).toMatchObject({ profession: "", topics: [], language: "English" });
    expect(readBrief({ profession: "Product lead", topics: ["Hiring"], updated_at: "2026-10-16" })).toMatchObject({ profession: "Product lead", topics: ["Hiring"] });
    expect(readBrief(null).language).toBe("English");
  });
});
