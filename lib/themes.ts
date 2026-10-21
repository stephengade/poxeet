import { pillarTones } from "../components/workroom/tones";
import { localParts } from "./plan/slots";
import type { createClient } from "./supabase/server";

/**
 * The member's content pillars in the calendar's window (the last 62 days on), in the order that gives each its
 * colour. Pages that show posts outside the calendar (the sidebar, Drafts, the editor) use it so colours match.
 */
export async function loadThemes(supabase: Awaited<ReturnType<typeof createClient>>, memberId: string, timezone: string) {
  const since = new Date(`${localParts(new Date(), timezone).date}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 62);
  const { data } = await supabase.from("scheduled_posts").select("pillar")
    .eq("user_id", memberId).gte("scheduled_at", since.toISOString()).not("pillar", "is", null).limit(500);
  return pillarTones(data ?? []).pillars;
}
