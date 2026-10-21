import { EmptySection } from "../../../../components/workroom/setup-list";
import type { PostStatus } from "../../../../lib/post-status";
import { postUrl } from "../../../../lib/linkedin";
import { getMember, setupSteps } from "../../../../lib/member";
import { localParts } from "../../../../lib/plan/slots";
import { createClient } from "../../../../lib/supabase/server";
import { HistoryView, type HistoryRow } from "./history-view";

// History (PRD flow D): everything that went out, and anything that didn't, with the reason and what to do.
export default async function HistoryPage() {
  const member = await getMember();
  const { done, total } = setupSteps(member);
  if (done < total) {
    return (
      <EmptySection title="History" sub="Everything that went out, and anything that needs a check." icon="clock"
        empty={{ title: "Nothing posted yet", text: "Posts appear here after they go out on LinkedIn, with a link to each one." }} />
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.from("scheduled_posts")
    .select("id, content, scheduled_at, posted_at, status, last_error, linkedin_post_urn, posted_via")
    .eq("user_id", member.id).in("status", ["posted", "failed", "needs_check", "missed"])
    .order("scheduled_at", { ascending: false }).limit(300);
  const rows: HistoryRow[] = (data ?? []).map((row) => {
    const local = localParts(new Date(row.posted_at ?? row.scheduled_at), member.timezone);
    return {
      id: row.id, date: local.date, time: local.time, text: row.content, status: row.status as PostStatus, reason: row.last_error,
      link: row.linkedin_post_urn ? postUrl(row.linkedin_post_urn) : null, byHand: row.posted_via === "manual",
    };
  });
  return <HistoryView rows={rows} />;
}
