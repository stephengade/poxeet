import { MONTHS } from "../components/calendar/dates";
import { email, type TemplateData } from "./email";
import { PREFERENCE_COLUMNS, wantsEmail } from "./email-preferences";
import { localParts, mondayOf } from "./plan/slots";
import { createAdminClient, getSecretKey } from "./supabase/admin";

// Account notices to the member, by email. Server only. Call inside next/server's `after()` so the email goes
// out once the response is sent: a slow or failed send never delays or breaks what the member is doing.

type AccountNotice = "linkedinConnected" | "linkedinDisconnected";

export async function sendAccountNotice<N extends AccountNotice>(userId: string, template: N, data: Omit<TemplateData<N>, "firstName">) {
  if (!getSecretKey()) return;
  const { data: profile } = await createAdminClient().from("profiles").select("email, first_name, display_name").eq("id", userId).maybeSingle();
  if (!profile?.email) return;
  const result = await email.sendSingle({
    to: { email: profile.email, name: profile.display_name ?? undefined },
    template,
    data: { ...data, firstName: profile.first_name } as TemplateData<N>,
    reference: `${template}:${userId}`,
  });
  if (!result.ok) console.error(`[notify] ${template} email to member ${userId} failed: ${result.error}`);
}

/**
 * "New drafts are ready" (D-030), once a week of a calendar's drafts is saved. Only for members who turned it on,
 * and at most once per calendar week in their timezone (notifications dedupe, kind drafts_ready), so a long plan
 * or a second plan the same week doesn't send a stream of emails. Never throws; returns whether an email went out.
 */
export async function sendDraftsReady(userId: string, { count, weekStart, moreWeeks, timeZone }: {
  count: number; weekStart: string; moreWeeks: number; timeZone: string;
}, now = new Date()): Promise<boolean> {
  try {
    if (!getSecretKey() || count < 1) return false;
    const admin = createAdminClient();
    // Checked before the dedupe row is written, so turning it on later in the week still sends this week's email.
    const { data: profile } = await admin.from("profiles").select(`email, first_name, display_name, ${PREFERENCE_COLUMNS}`).eq("id", userId).maybeSingle();
    if (!profile?.email || !wantsEmail(profile, "draftsReady")) return false;
    const thisWeek = mondayOf(localParts(now, timeZone).date);
    const { error: duplicate } = await admin.from("notifications").insert({ user_id: userId, kind: "drafts_ready", dedupe_key: thisWeek });
    if (duplicate) return false;
    const start = new Date(`${weekStart}T00:00:00Z`);
    const result = await email.sendSingle({
      to: { email: profile.email, name: profile.display_name ?? undefined },
      template: "draftsReady",
      data: { firstName: profile.first_name, count, weekLabel: `the week of ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`, moreWeeks },
      reference: `drafts-ready:${userId}:${thisWeek}`,
    });
    if (!result.ok) console.error(`[notify] draftsReady email to member ${userId} failed: ${result.error}`);
    return result.ok;
  } catch (error) {
    console.error(`[notify] draftsReady email to member ${userId} crashed:`, error);
    return false;
  }
}
