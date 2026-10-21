import { EmptySection } from "../../../../components/workroom/setup-list";
import { getMember, setupSteps } from "../../../../lib/member";
import { localParts, mondayOf } from "../../../../lib/plan/slots";
import { createClient } from "../../../../lib/supabase/server";
import { loadThemes } from "../../../../lib/themes";
import { DraftsView, type DraftPost } from "./drafts-view";

// Drafts (PRD CAL-5, CAL-6): every draft waiting for review, one at a time, with approve, skip, rewrite and edit.
export default async function DraftsPage() {
  const member = await getMember();
  const { done, total } = setupSteps(member);
  if (done < total) {
    return (
      <EmptySection title="Drafts" sub="Posts waiting for your review." icon="pencil"
        empty={{ title: "No drafts to review", text: "Drafts appear here when Poxeet writes your next week. Approve, edit or skip each one." }} />
    );
  }
  const supabase = await createClient();
  const [{ data: rows }, themes] = await Promise.all([
    supabase.from("scheduled_posts")
      .select("id, content, scheduled_at, pillar, post_type, rationale, needs_user_input, flags")
      .eq("user_id", member.id).eq("status", "draft").order("scheduled_at").limit(200),
    loadThemes(supabase, member.id, member.timezone),
  ]);
  const drafts: DraftPost[] = (rows ?? []).map((row) => {
    const local = localParts(new Date(row.scheduled_at), member.timezone);
    return {
      id: row.id, date: local.date, time: local.time, text: row.content, pillar: row.pillar, postType: row.post_type,
      rationale: row.rationale, needsInput: row.needs_user_input, flags: Array.isArray(row.flags) ? (row.flags as string[]) : [],
    };
  });
  const today = localParts(new Date(), member.timezone).date;
  const weekEnd = addDays(mondayOf(today), 6);
  return <DraftsView drafts={drafts} weekEnd={weekEnd} timezone={member.timezone} themes={themes} />;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
