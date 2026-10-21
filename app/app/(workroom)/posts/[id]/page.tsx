import { notFound } from "next/navigation";
import { getMember } from "../../../../../lib/member";
import { postUrl } from "../../../../../lib/linkedin";
import { localParts } from "../../../../../lib/plan/slots";
import type { PostStatus } from "../../../../../lib/post-status";
import { createClient } from "../../../../../lib/supabase/server";
import { loadThemes } from "../../../../../lib/themes";
import { toneIn } from "../../../../../components/workroom/tones";
import { PostEditor } from "./post-editor";

// One post (PRD CAL-5): edit, rewrite with an instruction, approve or skip, with a LinkedIn-style preview.
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, member] = await Promise.all([params, getMember()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: post }, themes] = await Promise.all([
    supabase.from("scheduled_posts")
      .select("id, content, scheduled_at, status, pillar, post_type, topic_angle, rationale, needs_user_input, flags, last_error, linkedin_post_urn, posted_via, posted_at")
      .eq("id", id).maybeSingle(),
    loadThemes(supabase, member.id, member.timezone),
  ]);
  if (!post) notFound();
  const local = localParts(new Date(post.scheduled_at), member.timezone);
  const initials = member.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
  return (
    <PostEditor
      post={{
        id: post.id, text: post.content, date: local.date, time: local.time, status: post.status as PostStatus,
        pillar: post.pillar, postType: post.post_type, angle: post.topic_angle, rationale: post.rationale,
        needsInput: post.needs_user_input, flags: Array.isArray(post.flags) ? (post.flags as string[]) : [], error: post.last_error,
        link: post.linkedin_post_urn ? postUrl(post.linkedin_post_urn) : null, postedVia: post.posted_via,
        postedAt: post.posted_at ? localParts(new Date(post.posted_at), member.timezone) : null,
      }}
      author={{ name: member.setup.linkedinAccount?.name ?? member.name, initials }}
      timezone={member.timezone}
      linkedinConnected={member.setup.linkedin !== "disconnected"}
      tone={toneIn(themes, post.pillar)}
    />
  );
}
