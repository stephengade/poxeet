import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_PREFERENCES, preferenceColumns, wantsEmail } from "../lib/email-preferences";

// Notification settings (D-030): the preference check, and the senders (the daily job's, and drafts ready) skipping
// members who turned an email off. The senders run against a small in-memory stand-in for the admin client; no email is really sent.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const sent: Array<{ to: string; template: string; data?: unknown }> = [];

/** Just enough of supabase-js's query builder for lib/digest.ts and lib/notify.ts: filters by eq/in, ignores ranges. */
function table(name: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let head = false;
  const rows = () => (db[name] ?? []).filter((row) => filters.every((filter) => filter(row)));
  const query = {
    select: (_columns?: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return query; },
    eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
    gt: () => query, lt: () => query, gte: () => query, lte: () => query, limit: () => query,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    insert: async (row: Row) => {
      const list = (db[name] ??= []);
      if (list.some((other) => other.user_id === row.user_id && other.kind === row.kind && other.dedupe_key === row.dedupe_key)) return { error: { message: "duplicate" } };
      list.push(row);
      return { error: null };
    },
    then: (resolve: (value: unknown) => void) => resolve(head ? { count: rows().length, data: null, error: null } : { data: rows(), error: null }),
  };
  return query;
}

vi.mock("../lib/supabase/admin", () => ({ createAdminClient: () => ({ from: table }), getSecretKey: () => "test" }));
vi.mock("../lib/email", () => ({
  email: { sendSingle: async (message: { to: string | { email: string }; template: string; data: unknown }) => {
    sent.push({ to: typeof message.to === "string" ? message.to : message.to.email, template: message.template, data: message.data });
    return { ok: true };
  } },
}));

const { sendEmptyWeekEmails, sendExpiryEmails, sendWeeklySummaries } = await import("../lib/digest");
const { sendDraftsReady } = await import("../lib/notify");

describe("wantsEmail", () => {
  it("always sends failure emails", () => {
    expect(wantsEmail(null, "postFailed")).toBe(true);
    expect(wantsEmail({ email_linkedin_expiring: false, email_empty_week: false, email_drafts_ready: false, email_weekly_summary: false }, "postFailed")).toBe(true);
  });

  it("follows the member's switch", () => {
    expect(wantsEmail({ email_linkedin_expiring: false }, "linkedinExpiring")).toBe(false);
    expect(wantsEmail({ email_empty_week: true }, "emptyWeek")).toBe(true);
  });

  it("uses the column default when the row doesn't say", () => {
    expect(wantsEmail({}, "linkedinExpiring")).toBe(true);
    expect(wantsEmail({ email_empty_week: null }, "emptyWeek")).toBe(true);
    expect(wantsEmail({}, "draftsReady")).toBe(false);
  });

  it("offers a switch for every optional email, and none for failures", () => {
    expect(EMAIL_PREFERENCES.filter((item) => !item.column).map((item) => item.kind)).toEqual(["postFailed"]);
    expect(preferenceColumns({ linkedinExpiring: false, emptyWeek: true, draftsReady: true, weeklySummary: false }))
      .toEqual({ email_linkedin_expiring: false, email_empty_week: true, email_drafts_ready: true, email_weekly_summary: false });
    expect(EMAIL_PREFERENCES.filter((item) => item.soon)).toEqual([]);
  });
});

describe("the daily job's emails", () => {
  // Thursday 22 October 2026: next week's warning is due.
  const now = new Date("2026-10-22T10:00:00Z");
  const member = (id: string, values: Row = {}): Row => ({
    id, email: `${id}@example.test`, first_name: id, timezone: "UTC", account_status: "active", paused: false,
    posting_slots: [{ day: "mon", time: "09:00" }], ...values,
  });

  beforeEach(() => {
    for (const key of Object.keys(db)) delete db[key];
    sent.length = 0;
    db.profiles = [member("on"), member("off", { email_linkedin_expiring: false, email_empty_week: false })];
    db.voice_profiles = [{ user_id: "on", is_active: true }, { user_id: "off", is_active: true }];
    const expires = new Date(now.getTime() + 6.5 * 86_400_000).toISOString();
    db.linkedin_connections = [{ user_id: "on", expires_at: expires, status: "active" }, { user_id: "off", expires_at: expires, status: "active" }];
  });

  it("emails about an empty next week only to members who want it", async () => {
    expect(await sendEmptyWeekEmails(now)).toBe(1);
    expect(sent.map(({ to, template }) => ({ to, template }))).toEqual([{ to: "on@example.test", template: "emptyNextWeek" }]);
    expect(db.notifications.map((row) => row.user_id)).toEqual(["on"]);
  });

  it("emails about LinkedIn access ending only to members who want it", async () => {
    expect(await sendExpiryEmails(now)).toBe(1);
    expect(sent.map(({ to, template }) => ({ to, template }))).toEqual([{ to: "on@example.test", template: "linkedinExpiring" }]);
    // No dedupe row for the member who opted out, so turning it back on still sends the next reminder.
    expect(db.notifications.map((row) => row.user_id)).toEqual(["on"]);
  });

  it("sends to members without saved preferences (the defaults are on)", async () => {
    db.profiles = [member("new")];
    db.voice_profiles = [{ user_id: "new", is_active: true }];
    db.linkedin_connections = [{ user_id: "new", expires_at: new Date(now.getTime() + 0.5 * 86_400_000).toISOString(), status: "active" }];
    expect(await sendEmptyWeekEmails(now)).toBe(1);
    expect(await sendExpiryEmails(now)).toBe(1);
  });
});

describe("the weekly summary", () => {
  // Monday 26 October 2026.
  const monday = new Date("2026-10-26T08:00:00Z");
  const profile = (id: string, values: Row = {}): Row => ({ id, email: `${id}@example.test`, first_name: id, timezone: "UTC", account_status: "active", ...values });

  beforeEach(() => {
    for (const key of Object.keys(db)) delete db[key];
    sent.length = 0;
    db.profiles = [profile("on", { email_weekly_summary: true }), profile("off", { email_weekly_summary: false }), profile("new")];
    db.scheduled_posts = ["on", "off", "new"].map((user_id) => ({
      user_id, status: "posted", scheduled_at: "2026-10-21T09:00:00Z", posted_at: "2026-10-21T09:00:05Z", content: "Most roadmaps are wishlists.\n\nMore.",
    }));
  });

  it("goes only to members who turned it on (off by default), once a week", async () => {
    expect(await sendWeeklySummaries(monday)).toBe(1);
    expect(sent).toEqual([{
      to: "on@example.test", template: "weeklySummary",
      data: { firstName: "on", weekLabel: "the week of 26 October", posted: 1, notPosted: 0, openings: ["Most roadmaps are wishlists."], approved: 0, drafts: 0 },
    }]);
    expect(db.notifications).toEqual([{ user_id: "on", kind: "weekly_summary", dedupe_key: "2026-10-26" }]);
    expect(await sendWeeklySummaries(new Date("2026-10-26T20:00:00Z"))).toBe(0);
  });

  it("stays quiet on other days", async () => {
    expect(await sendWeeklySummaries(new Date("2026-10-27T08:00:00Z"))).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("the drafts ready email", () => {
  // Tuesday 20 October 2026; the drafts are for the week starting Monday 26 October.
  const now = new Date("2026-10-20T10:00:00Z");
  const week = { count: 3, weekStart: "2026-10-26", moreWeeks: 1, timeZone: "UTC" };

  beforeEach(() => {
    for (const key of Object.keys(db)) delete db[key];
    sent.length = 0;
    db.profiles = [
      { id: "on", email: "on@example.test", first_name: "On", email_drafts_ready: true },
      { id: "off", email: "off@example.test", first_name: "Off", email_drafts_ready: false },
      { id: "new", email: "new@example.test", first_name: "New" },
    ];
  });

  it("goes only to members who turned it on (off by default)", async () => {
    expect(await sendDraftsReady("on", week, now)).toBe(true);
    expect(await sendDraftsReady("off", week, now)).toBe(false);
    expect(await sendDraftsReady("new", week, now)).toBe(false);
    expect(sent).toEqual([{ to: "on@example.test", template: "draftsReady", data: { firstName: "On", count: 3, weekLabel: "the week of 26 October", moreWeeks: 1 } }]);
    // No dedupe row for members who opted out, so turning it on later this week still sends.
    expect(db.notifications).toEqual([{ user_id: "on", kind: "drafts_ready", dedupe_key: "2026-10-19" }]);
  });

  it("goes at most once per calendar week", async () => {
    expect(await sendDraftsReady("on", week, now)).toBe(true);
    expect(await sendDraftsReady("on", { ...week, weekStart: "2026-11-02" }, new Date("2026-10-25T20:00:00Z"))).toBe(false);
    expect(await sendDraftsReady("on", { ...week, weekStart: "2026-11-02" }, new Date("2026-10-26T08:00:00Z"))).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("counts the week in the member's timezone", async () => {
    // Sunday 25 October 20:00 UTC is already Monday 26 October in Auckland: a new week there.
    expect(await sendDraftsReady("on", week, now)).toBe(true);
    expect(await sendDraftsReady("on", { ...week, timeZone: "Pacific/Auckland" }, new Date("2026-10-25T20:00:00Z"))).toBe(true);
  });
});
