import { MONTHS } from "../components/calendar/dates";
import { email } from "./email";
import { PREFERENCE_COLUMNS, wantsEmail } from "./email-preferences";
import type { Slot } from "./member";
import { localParts, mondayOf, planSlots } from "./plan/slots";
import { createAdminClient } from "./supabase/admin";

// The daily job's emails: the empty-next-week warning (PRD flow C: "when next week has no approved posts") and the
// LinkedIn access reminder. From Thursday on, a member with posting days but nothing approved or sent for next week
// gets one email per week. On their Monday, members who turned it on get the weekly summary. All of them skip
// members who turned the email off (Settings → Notifications, D-030).

/** Weekday index (Monday 0) from which next week counts as "coming up". */
const FROM_WEEKDAY = 3; // Thursday

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export type EmptyWeek = { weekStart: string; weekLabel: string; openSlots: number };

/**
 * Whether to warn about next week, and what to say. Pure, so it's tested directly. `readyDates` are the local
 * dates of next week's approved, sending or sent posts.
 */
export function emptyNextWeek({ now, timeZone, slots, readyDates }: { now: Date; timeZone: string; slots: Slot[]; readyDates: string[] }): EmptyWeek | null {
  if (!slots.length) return null;
  const today = localParts(now, timeZone).date;
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  if (weekday < FROM_WEEKDAY) return null;
  const weekStart = addDays(mondayOf(today), 7);
  const weekEnd = addDays(weekStart, 6);
  if (readyDates.some((date) => date >= weekStart && date <= weekEnd)) return null;
  const openSlots = planSlots({ startDate: weekStart, weeks: 1, slots, timeZone, now }).length;
  if (!openSlots) return null;
  const start = new Date(`${weekStart}T00:00:00Z`);
  return { weekStart, weekLabel: `the week of ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`, openSlots };
}

/** For the daily job: checks every active, unpaused member with a voice profile and emails those with an empty next week. */
export async function sendEmptyWeekEmails(now = new Date()) {
  const admin = createAdminClient();
  const { data: members } = await admin.from("profiles").select(`id, email, first_name, timezone, posting_slots, ${PREFERENCE_COLUMNS}`)
    .eq("account_status", "active").eq("paused", false).limit(5000);
  let sent = 0;
  for (const member of members ?? []) {
    const slots = Array.isArray(member.posting_slots) ? (member.posting_slots as Slot[]) : [];
    if (!slots.length || !member.email || !wantsEmail(member, "emptyWeek")) continue;
    const { count: voice } = await admin.from("voice_profiles").select("id", { count: "exact", head: true }).eq("user_id", member.id).eq("is_active", true);
    if (!voice) continue;
    // Next week's ready posts, read with a day of margin either side; the pure check uses local dates.
    const from = new Date(now.getTime() - 86_400_000).toISOString();
    const to = new Date(now.getTime() + 16 * 86_400_000).toISOString();
    const { data: ready } = await admin.from("scheduled_posts").select("scheduled_at").eq("user_id", member.id)
      .in("status", ["approved", "posting", "posted"]).gte("scheduled_at", from).lte("scheduled_at", to);
    const week = emptyNextWeek({
      now, timeZone: member.timezone, slots,
      readyDates: (ready ?? []).map((row) => localParts(new Date(row.scheduled_at), member.timezone).date),
    });
    if (!week) continue;
    const { error: duplicate } = await admin.from("notifications").insert({ user_id: member.id, kind: "empty_next_week", dedupe_key: week.weekStart });
    if (duplicate) continue;
    const result = await email.sendSingle({
      to: member.email, template: "emptyNextWeek", reference: `empty-week:${member.id}:${week.weekStart}`,
      data: { firstName: member.first_name, weekLabel: week.weekLabel, openSlots: week.openSlots },
    });
    if (result.ok) sent++;
  }
  return sent;
}

export type SummaryPost = { status: string; scheduled_at: string; posted_at?: string | null; content?: string | null };
export type WeekSummary = { weekStart: string; weekLabel: string; posted: number; notPosted: number; openings: string[]; approved: number; drafts: number };

const OPENINGS = 3;

/**
 * The weekly summary, on the member's Monday: what went out last week, and what's approved or still a draft for
 * this week. Null on other days, or when there's nothing to say. Pure, so it's tested directly.
 */
export function summarizeWeek({ now, timeZone, posts }: { now: Date; timeZone: string; posts: SummaryPost[] }): WeekSummary | null {
  const today = localParts(now, timeZone).date;
  const weekStart = mondayOf(today);
  if (today !== weekStart) return null;
  const lastWeekStart = addDays(weekStart, -7);
  const weekEnd = addDays(weekStart, 6);
  const dateOf = (at: string) => localParts(new Date(at), timeZone).date;
  const lastWeek = (at: string) => dateOf(at) >= lastWeekStart && dateOf(at) < weekStart;
  const thisWeek = (at: string) => dateOf(at) >= weekStart && dateOf(at) <= weekEnd;

  const posted = posts.filter((post) => post.status === "posted" && lastWeek(post.posted_at ?? post.scheduled_at))
    .sort((a, b) => (a.posted_at ?? a.scheduled_at).localeCompare(b.posted_at ?? b.scheduled_at));
  const notPosted = posts.filter((post) => (post.status === "failed" || post.status === "missed") && lastWeek(post.scheduled_at)).length;
  const approved = posts.filter((post) => ["approved", "posting", "posted"].includes(post.status) && thisWeek(post.scheduled_at)).length;
  const drafts = posts.filter((post) => post.status === "draft" && thisWeek(post.scheduled_at)).length;
  if (!posted.length && !notPosted && !approved && !drafts) return null;

  const openings = posted.slice(0, OPENINGS).map((post) => (post.content ?? "").split("\n").find((line) => line.trim())?.trim().slice(0, 120) ?? "").filter(Boolean);
  const start = new Date(`${weekStart}T00:00:00Z`);
  return { weekStart, weekLabel: `the week of ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`, posted: posted.length, notPosted, openings, approved, drafts };
}

/** For the daily job: the Monday summary, for active members who turned it on. One a week (notifications dedupe). */
export async function sendWeeklySummaries(now = new Date()) {
  const admin = createAdminClient();
  const { data: members } = await admin.from("profiles").select(`id, email, first_name, timezone, ${PREFERENCE_COLUMNS}`)
    .eq("account_status", "active").limit(5000);
  let sent = 0;
  for (const member of members ?? []) {
    if (!member.email || !wantsEmail(member, "weeklySummary")) continue;
    // Last week and this week, read with a couple of days of margin; the pure check uses local dates.
    const { data: posts } = await admin.from("scheduled_posts").select("status, scheduled_at, posted_at, content").eq("user_id", member.id)
      .in("status", ["draft", "approved", "posting", "posted", "failed", "missed"])
      .gte("scheduled_at", new Date(now.getTime() - 9 * DAY).toISOString()).lte("scheduled_at", new Date(now.getTime() + 8 * DAY).toISOString());
    const summary = summarizeWeek({ now, timeZone: member.timezone, posts: posts ?? [] });
    if (!summary) continue;
    const { error: duplicate } = await admin.from("notifications").insert({ user_id: member.id, kind: "weekly_summary", dedupe_key: summary.weekStart });
    if (duplicate) continue;
    const result = await email.sendSingle({
      to: member.email, template: "weeklySummary", reference: `weekly-summary:${member.id}:${summary.weekStart}`,
      data: {
        firstName: member.first_name, weekLabel: summary.weekLabel, posted: summary.posted, notPosted: summary.notPosted,
        openings: summary.openings, approved: summary.approved, drafts: summary.drafts,
      },
    });
    if (result.ok) sent++;
  }
  return sent;
}

const DAY = 86_400_000;

/** For the daily job: LinkedIn access ends in about 7 days or 1 day. One email each (notifications dedupe), with posts waiting. */
export async function sendExpiryEmails(now = new Date()) {
  const admin = createAdminClient();
  const { data: connections } = await admin.from("linkedin_connections").select("user_id, expires_at")
    .eq("status", "active").gt("expires_at", now.toISOString()).lt("expires_at", new Date(now.getTime() + 8 * DAY).toISOString());
  let sent = 0;
  for (const connection of connections ?? []) {
    const daysLeft = Math.ceil((new Date(connection.expires_at).getTime() - now.getTime()) / DAY);
    const mark = daysLeft <= 1 ? 1 : daysLeft <= 7 ? 7 : null;
    if (!mark) continue;
    // Checked before the dedupe row is written, so turning the email back on still sends the next reminder.
    const { data: profile } = await admin.from("profiles").select(`email, first_name, ${PREFERENCE_COLUMNS}`).eq("id", connection.user_id).maybeSingle();
    if (!profile?.email || !wantsEmail(profile, "linkedinExpiring")) continue;
    const { error: duplicate } = await admin.from("notifications").insert({
      user_id: connection.user_id, kind: "linkedin_expiring", dedupe_key: `${connection.expires_at.slice(0, 10)}:${mark}`,
    });
    if (duplicate) continue;
    const { count } = await admin.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("user_id", connection.user_id).eq("status", "approved");
    const result = await email.sendSingle({
      to: profile.email, template: "linkedinExpiring", reference: `linkedin-expiring:${connection.user_id}:${mark}`,
      data: { firstName: profile.first_name, daysLeft, scheduledCount: count ?? 0 },
    });
    if (result.ok) sent++;
  }
  return sent;
}
