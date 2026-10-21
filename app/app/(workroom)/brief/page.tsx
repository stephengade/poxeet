import { readBrief } from "../../../../lib/brief";
import { getMember } from "../../../../lib/member";
import { createClient } from "../../../../lib/supabase/server";
import { voiceProfileSchema } from "../../../../lib/voice/profile";
import { BriefForm } from "./brief-form";

// Brief (PRD onboarding step 3): who the member writes for, what they want from posting, topics and language.
export default async function BriefPage() {
  const member = await getMember();
  const supabase = await createClient();
  const [{ data: profile }, { data: voice }] = await Promise.all([
    supabase.from("profiles").select("brief").eq("id", member.id).single(),
    supabase.from("voice_profiles").select("profile").eq("user_id", member.id).eq("is_active", true).maybeSingle(),
  ]);
  const raw = profile?.brief as { updated_at?: string } | null;
  const parsedVoice = voice ? voiceProfileSchema.safeParse(voice.profile) : null;
  // Topics the voice analysis found, offered as one-click suggestions.
  const suggested = parsedVoice?.success ? parsedVoice.data.topics.recurring : [];
  return <BriefForm initial={readBrief(profile?.brief)} savedAt={raw?.updated_at ?? null} suggested={suggested} postsPerWeek={member.slots.length || 3} />;
}
