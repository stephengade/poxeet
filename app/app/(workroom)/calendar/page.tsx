import { EmptySection } from "../../../../components/workroom/setup-list";
import type { PostStatus } from "../../../../lib/post-status";
import { getMember, setupSteps } from "../../../../lib/member";
import { localParts, mondayOf } from "../../../../lib/plan/slots";
import { createClient } from "../../../../lib/supabase/server";
import { calendarProgress } from "./actions";
import { CalendarView, type MemberPost } from "./calendar-view";

// Calendar (PRD flow B, CAL-1 to CAL-4): the month with every post, planning a month, and its progress.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const [member, { plan }] = await Promise.all([getMember(), searchParams]);
  const { done, total } = setupSteps(member);
  if (done < total) {
    return (
      <EmptySection
        title="Calendar"
        sub="Your posts by day, with open slots in your rhythm."
        icon="calendar"
        empty={{ title: "No posts planned yet", text: "Once setup is done, plan a month here. Drafts arrive a week at a time, and nothing goes out until you approve it." }}
      />
    );
  }

  const today = todayIn(member.timezone);
  const supabase = await createClient();
  const [progress, { data: voice }, { data: rows }] = await Promise.all([
    calendarProgress(),
    supabase.from("voice_profiles").select("id").eq("user_id", member.id).eq("is_active", true).maybeSingle(),
    supabase.from("scheduled_posts").select("id, content, scheduled_at, status, pillar, post_type")
      .eq("user_id", member.id).gte("scheduled_at", `${addDays(today, -62)}T00:00:00Z`)
      .order("scheduled_at").limit(500),
  ]);

  const posts: MemberPost[] = (rows ?? []).map((row) => {
    const local = localParts(new Date(row.scheduled_at), member.timezone);
    return { id: row.id, date: local.date, time: local.time, text: row.content, status: row.status as PostStatus, pillar: row.pillar, postType: row.post_type };
  });
  // A plan starts on the next Monday by default (today, if today is a Monday).
  const nextMonday = mondayOf(today) === today ? today : addDays(mondayOf(today), 7);

  return (
    <CalendarView
      today={today}
      posts={posts}
      progress={progress}
      hasVoice={Boolean(voice)}
      slots={member.slots}
      timezone={member.timezone}
      defaultStart={nextMonday}
      openPlan={plan === "1"}
      linkedinConnected={member.setup.linkedin !== "disconnected"}
    />
  );
}

/** Today's date where the member is. */
function todayIn(timeZone: string) {
  return localParts(new Date(), timeZone).date;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
