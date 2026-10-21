import { EmptySection } from "../../../../components/workroom/setup-list";
import { MIN_VOICE_POSTS } from "../../../../lib/import/posts";
import { getMember, setupSteps } from "../../../../lib/member";
import { createClient } from "../../../../lib/supabase/server";
import { voiceProfileSchema } from "../../../../lib/voice/profile";
import { voiceStatus } from "./actions";
import { VoiceView, type VoiceVersion } from "./voice-view";

// Voice (PRD section 9): the member's active voice profile in plain language, its versions, and analysing again.
// Read as the member (Row Level Security). Before there are enough posts, it points back to setup.

export default async function VoicePage() {
  const member = await getMember();
  const posts = member.setup.importedPosts;
  if (posts < MIN_VOICE_POSTS) {
    const { done, total } = setupSteps(member);
    return (
      <EmptySection
        title="Voice"
        sub="How Poxeet writes like you."
        icon="voice"
        setupDone={done === total}
        empty={{ title: "No voice profile yet", text: `Add ${MIN_VOICE_POSTS} or more of your LinkedIn posts in setup and Poxeet works out your voice: tone, structure, signature moves. 10+ gives a sharper voice.` }}
      />
    );
  }

  const supabase = await createClient();
  const [status, { data: versions }] = await Promise.all([
    voiceStatus(),
    supabase.from("voice_profiles").select("id, version, origin, is_active, source_post_count, created_at, profile")
      .eq("user_id", member.id).order("version", { ascending: false }).limit(10),
  ]);
  const activeRow = versions?.find((row) => row.is_active) ?? null;
  const parsed = activeRow ? voiceProfileSchema.safeParse(activeRow.profile) : null;
  const profile = parsed?.success ? parsed.data : null;

  // The posts each signature move cites, for a short excerpt under it.
  const cited = profile ? [...new Set(profile.signature_moves.flatMap((move) => move.example_post_ids))].slice(0, 40) : [];
  const { data: examples } = cited.length
    ? await supabase.from("imported_posts").select("id, text").in("id", cited)
    : { data: [] as Array<{ id: string; text: string }> };

  const history: VoiceVersion[] = (versions ?? []).map((row) => ({
    version: row.version, origin: row.origin, active: row.is_active, posts: row.source_post_count, createdAt: row.created_at,
  }));

  return (
    <VoiceView
      postCount={posts}
      status={status}
      profile={profile}
      active={activeRow ? { version: activeRow.version, posts: activeRow.source_post_count, createdAt: activeRow.created_at } : null}
      versions={history}
      examples={Object.fromEntries((examples ?? []).map((row) => [row.id, row.text]))}
    />
  );
}
