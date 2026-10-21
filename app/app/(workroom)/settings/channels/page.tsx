import { Suspense } from "react";
import { XLogo } from "../../../../../components/brand/channel-logos";
import { mondayIndex, parseIsoDate, WEEKDAYS } from "../../../../../components/calendar/dates";
import { SettingsHead } from "../../../../../components/workroom/settings-head";
import { getMember } from "../../../../../lib/member";
import { localParts } from "../../../../../lib/plan/slots";
import { createClient } from "../../../../../lib/supabase/server";
import { LinkedInCard } from "./linkedin-card";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function ChannelSettings() {
  const member = await getMember();
  const supabase = await createClient();
  const { data: last } = await supabase.from("scheduled_posts").select("posted_at").eq("user_id", member.id).eq("status", "posted")
    .not("posted_at", "is", null).order("posted_at", { ascending: false }).limit(1).maybeSingle();
  const local = last?.posted_at ? localParts(new Date(last.posted_at), member.timezone) : null;
  const day = local ? parseIsoDate(local.date) : null;
  const lastPost = local && day ? `${WEEKDAYS[mondayIndex(day)]} ${day.getUTCDate()} ${MONTHS_SHORT[day.getUTCMonth()]} · ${local.time}` : null;
  return (
    <>
      <SettingsHead title="Channels">Where approved posts are published.</SettingsHead>
      {/* useSearchParams in the card reads the result of the LinkedIn round trip. */}
      <Suspense fallback={null}>
        <LinkedInCard account={member.setup.linkedinAccount} connected={member.setup.linkedin !== "disconnected"} paused={member.paused} lastPost={lastPost} />
      </Suspense>
      <section className="wr-card wr-settings-card wr-channel-card" data-soon>
        <div className="wr-settings-card-head wr-settings-card-row">
          <div className="wr-channel-id">
            <XLogo size={44} />
            <div><h3 className="wr-h2">X<span className="wr-channel-status" data-state="soon">Soon</span></h3><p className="wr-sub wr-small">Same voice, shorter posts and threads.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
