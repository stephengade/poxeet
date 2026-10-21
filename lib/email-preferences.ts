import { z } from "zod";

// Which emails a member gets (Settings → Notifications, D-030). Stored as one boolean column per optional email on
// profiles. A failed post is always emailed. Read by the settings page and by every sender of an optional email.

export type EmailKind = "postFailed" | "linkedinExpiring" | "emptyWeek" | "draftsReady" | "weeklySummary";

type Preference = {
  kind: EmailKind;
  title: string;
  hint: string;
  /** The profiles column that turns it off; null when it can't be turned off. */
  column: "email_linkedin_expiring" | "email_empty_week" | "email_drafts_ready" | "email_weekly_summary" | null;
  /** The column's default, for a profile read before the column existed. */
  fallback: boolean;
  /** Nothing sends it yet: the switch shows "Soon" and can't be changed. */
  soon?: boolean;
};

export const EMAIL_PREFERENCES: Preference[] = [
  { kind: "postFailed", title: "A post fails to go out", hint: "With the reason and a link to fix it.", column: null, fallback: true },
  { kind: "linkedinExpiring", title: "LinkedIn access is about to end", hint: "7 days and 1 day before, so posts keep going out.", column: "email_linkedin_expiring", fallback: true },
  { kind: "emptyWeek", title: "Next week has no approved posts", hint: "From Thursday, once a week.", column: "email_empty_week", fallback: true },
  { kind: "draftsReady", title: "New drafts are ready", hint: "When a week of drafts arrives, at most once a week.", column: "email_drafts_ready", fallback: false },
  { kind: "weeklySummary", title: "Weekly summary", hint: "On Monday: what went out and what's coming up.", column: "email_weekly_summary", fallback: false },
];

/** The columns to select from profiles to check every preference. */
export const PREFERENCE_COLUMNS = "email_linkedin_expiring, email_empty_week, email_drafts_ready, email_weekly_summary";

export type PreferenceRow = Partial<Record<NonNullable<Preference["column"]>, boolean | null>>;

/** Whether the member wants this email. Emails that can't be turned off always return true. */
export function wantsEmail(row: PreferenceRow | null | undefined, kind: EmailKind): boolean {
  const preference = EMAIL_PREFERENCES.find((item) => item.kind === kind)!;
  if (!preference.column) return true;
  return row?.[preference.column] ?? preference.fallback;
}

/** The switches a member can change, as saved from the settings page. */
export const emailPreferencesSchema = z.object({
  linkedinExpiring: z.boolean(),
  emptyWeek: z.boolean(),
  draftsReady: z.boolean(),
  weeklySummary: z.boolean(),
});

export type EmailPreferences = z.infer<typeof emailPreferencesSchema>;

/** The saved switches as profile columns. */
export function preferenceColumns(values: EmailPreferences) {
  return {
    email_linkedin_expiring: values.linkedinExpiring, email_empty_week: values.emptyWeek,
    email_drafts_ready: values.draftsReady, email_weekly_summary: values.weeklySummary,
  };
}
