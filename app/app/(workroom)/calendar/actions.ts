"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { resolveAiAccess } from "../../../../lib/ai/server";
import { getMember, setupSteps } from "../../../../lib/member";
import { runCalendar } from "../../../../lib/plan/run";
import { planSlots } from "../../../../lib/plan/slots";
import { createAdminClient, getSecretKey } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

// Planning a calendar and checking on it. The work runs after the response (next/server after()); the Calendar
// page polls calendarProgress while it runs.

/** A run that hasn't moved for this long is treated as dead (the server restarted mid-run), so it can be resumed. */
const STALE_MS = 15 * 60 * 1000;

const planInput = z.object({
  startDate: z.iso.date("Pick a start date."),
  weeks: z.number().int().min(1, "At least 1 week.").max(8, "Up to 8 weeks at a time."),
});

export type PlanResult = { ok: true; calendarId: string } | { ok: false; message: string; fix?: { label: string; href: string } };

export async function startPlan(input: z.input<typeof planInput>): Promise<PlanResult> {
  const parsed = planInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the dates." };
  const member = await getMember();
  if (!getSecretKey()) return { ok: false, message: "AI isn't set up on this instance yet." };
  const { done, total } = setupSteps(member);
  if (done < total) return { ok: false, message: "Finish setup first.", fix: { label: "Continue setup", href: "/app/setup" } };
  if (!member.slots.length) return { ok: false, message: "Choose your posting days first.", fix: { label: "Publishing schedule", href: "/app/settings/schedule" } };

  const admin = createAdminClient();
  const [{ data: voice }, { data: running }] = await Promise.all([
    admin.from("voice_profiles").select("id").eq("user_id", member.id).eq("is_active", true).maybeSingle(),
    admin.from("calendars").select("id, updated_at").eq("user_id", member.id).in("status", ["planning", "drafting"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!voice) return { ok: false, message: "Analyse your voice first: drafts are written in it.", fix: { label: "Go to Voice", href: "/app/voice" } };
  if (running && Date.now() - new Date(running.updated_at).getTime() < STALE_MS) return { ok: false, message: "A plan is already being written. It'll be ready in a few minutes." };

  const access = await resolveAiAccess(member.id);
  if (!access.ok) {
    return { ok: false, message: access.message, fix: access.reason === "no_credits"
      ? { label: "Buy credits", href: "/app/settings/credits?buy=1" } : { label: "AI access", href: "/app/settings/ai" } };
  }

  const { startDate, weeks } = parsed.data;
  const slots = planSlots({ startDate, weeks, slots: member.slots, timeZone: member.timezone });
  if (!slots.length) return { ok: false, message: "No posting times fall in those weeks. Pick a later start date." };

  const { data: calendar, error } = await admin.from("calendars").insert({
    user_id: member.id, start_date: startDate, days: weeks * 7, posts_per_week: Math.min(14, Math.max(1, member.slots.length)),
    voice_profile_id: voice.id, plan: slots, timezone: member.timezone, status: "planning", weeks_total: weeks, weeks_done: 0,
  }).select("id").single();
  if (error || !calendar) {
    console.error("[plan] Couldn't create the calendar:", error?.message);
    return { ok: false, message: "We couldn't start the plan. Try again in a moment." };
  }
  after(() => runCalendar(calendar.id).then(() => revalidatePath("/app", "layout")));
  return { ok: true, calendarId: calendar.id };
}

/** Picks a failed (or stuck) calendar up where it stopped: finished weeks are kept. */
export async function resumePlan(calendarId: string): Promise<PlanResult> {
  const member = await getMember();
  const admin = createAdminClient();
  const { data: calendar } = await admin.from("calendars").select("id, status, updated_at").eq("id", calendarId).eq("user_id", member.id).maybeSingle();
  if (!calendar) return { ok: false, message: "That plan wasn't found." };
  const stuck = (calendar.status === "planning" || calendar.status === "drafting") && Date.now() - new Date(calendar.updated_at).getTime() > STALE_MS;
  if (calendar.status !== "failed" && !stuck) return { ok: true, calendarId };
  const access = await resolveAiAccess(member.id);
  if (!access.ok) {
    return { ok: false, message: access.message, fix: access.reason === "no_credits"
      ? { label: "Buy credits", href: "/app/settings/credits?buy=1" } : { label: "AI access", href: "/app/settings/ai" } };
  }
  await admin.from("calendars").update({ status: "drafting", reason: null, message: null, updated_at: new Date().toISOString() }).eq("id", calendarId).eq("user_id", member.id);
  after(() => runCalendar(calendarId).then(() => revalidatePath("/app", "layout")));
  return { ok: true, calendarId };
}

export type CalendarProgress = {
  id: string;
  status: "planning" | "drafting" | "ready" | "failed";
  weeksDone: number;
  weeksTotal: number;
  drafted: number;
  planned: number;
  reason: string | null;
  message: string | null;
  stale: boolean;
  /** When the plan started, and the opening lines of the latest drafts, newest first. */
  startedAt: string;
  recent: string[];
};

/** The member's latest calendar and how far it has got, read as them (Row Level Security). */
export async function calendarProgress(): Promise<CalendarProgress | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: calendar } = await supabase.from("calendars").select("id, status, weeks_done, weeks_total, reason, message, plan, updated_at, created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!calendar) return null;
  const [{ count }, { data: latest }] = await Promise.all([
    supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("calendar_id", calendar.id),
    supabase.from("scheduled_posts").select("content").eq("calendar_id", calendar.id).order("created_at", { ascending: false }).limit(3),
  ]);
  const running = calendar.status === "planning" || calendar.status === "drafting";
  return {
    id: calendar.id, status: calendar.status, weeksDone: calendar.weeks_done, weeksTotal: calendar.weeks_total,
    drafted: count ?? 0, planned: Array.isArray(calendar.plan) ? calendar.plan.length : 0,
    reason: calendar.reason, message: calendar.message,
    stale: running && Date.now() - new Date(calendar.updated_at).getTime() > STALE_MS,
    startedAt: calendar.created_at,
    recent: (latest ?? []).map((row) => (row.content.split("\n").find((line: string) => line.trim()) ?? "").slice(0, 120)).filter(Boolean),
  };
}
