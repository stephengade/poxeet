import { HomeView, type HomePost } from "./home-view";
import { billingEnabled } from "../../../lib/billing/config";
import { weeksLeft } from "../../../lib/billing/rates";
import { getMember, setupSteps } from "../../../lib/member";
import { localParts } from "../../../lib/plan/slots";
import type { PostStatus } from "../../../lib/post-status";
import { createClient } from "../../../lib/supabase/server";
import { voiceProfileSchema } from "../../../lib/voice/profile";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default async function HomePage() {
  const member = await getMember();
  const { steps, done, total } = setupSteps(member);
  const today = localParts(new Date(), member.timezone).date;

  // The same window as the calendar, so each pillar keeps the same colour on both pages.
  const supabase = await createClient();
  const [{ data: rows }, { data: voiceRow }] = await Promise.all([
    done === total
      ? supabase.from("scheduled_posts").select("id, content, scheduled_at, status, pillar, post_type")
        .eq("user_id", member.id).gte("scheduled_at", `${addDays(today, -62)}T00:00:00Z`).order("scheduled_at").limit(500)
      : Promise.resolve({ data: [] }),
    supabase.from("voice_profiles").select("version, profile").eq("user_id", member.id).eq("is_active", true).maybeSingle(),
  ]);
  const posts: HomePost[] = (rows ?? []).map((row) => {
    const local = localParts(new Date(row.scheduled_at), member.timezone);
    return { id: row.id, date: local.date, time: local.time, text: row.content, status: row.status as PostStatus, pillar: row.pillar, postType: row.post_type };
  });
  const parsed = voiceRow ? voiceProfileSchema.safeParse(voiceRow.profile) : null;
  const voice = voiceRow && parsed?.success ? { version: voiceRow.version, summary: parsed.data.summary, words: parsed.data.tone.descriptors } : null;
  const balance = member.setup.ai === "credits" || member.setup.ai === "none" ? member.setup.credits : null;
  const authorName = member.setup.linkedinAccount?.name ?? member.name;
  const initials = authorName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

  return (
    <HomeView firstName={member.firstName} today={today} steps={steps} done={done} total={total} posts={posts} drafts={member.drafts}
      slots={member.slots} timezone={member.timezone}
      credits={billingEnabled() && balance !== null ? { balance, weeks: weeksLeft(balance) } : null}
      voice={voice} author={{ name: authorName, initials }} />
  );
}
