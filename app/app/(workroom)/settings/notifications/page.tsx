import { SettingsHead } from "../../../../../components/workroom/settings-head";
import { PREFERENCE_COLUMNS, wantsEmail, type PreferenceRow } from "../../../../../lib/email-preferences";
import { getMember } from "../../../../../lib/member";
import { createClient } from "../../../../../lib/supabase/server";
import { NotificationsForm } from "./notifications-form";

export default async function NotificationSettings() {
  const member = await getMember();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PREFERENCE_COLUMNS).eq("id", member.id).single();
  const row = data as PreferenceRow | null;
  return (
    <>
      <SettingsHead title="Notifications">Emails go to your register email starting with <strong>{member.email.slice(0, 6)}...</strong></SettingsHead>
      <NotificationsForm initial={{
        linkedinExpiring: wantsEmail(row, "linkedinExpiring"), emptyWeek: wantsEmail(row, "emptyWeek"),
        draftsReady: wantsEmail(row, "draftsReady"), weeklySummary: wantsEmail(row, "weeklySummary"),
      }} />
    </>
  );
}
