"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rhythmStepSchema, WEEKDAYS } from "../../../lib/auth/schemas";
import { emailPreferencesSchema, preferenceColumns, type EmailPreferences } from "../../../lib/email-preferences";
import { createClient } from "../../../lib/supabase/server";

// Changes a member makes to their own profile row. Row Level Security limits each update to their row.

type Result = { ok: true } | { ok: false; message: string };

async function updateOwnProfile(fields: Record<string, unknown>): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  const { error } = await supabase.from("profiles").update(fields).eq("id", user.id);
  if (error) return { ok: false, message: "We couldn't save that. Try again in a moment." };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function setPublishingPaused(paused: boolean): Promise<Result> {
  return updateOwnProfile({ paused: paused === true });
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60),
  lastName: z.string().trim().max(60),
  timezone: z.string().min(1, "Pick your time zone."),
});
export type ProfileValues = z.input<typeof profileSchema>;

export async function saveProfile(input: ProfileValues): Promise<Result> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const { firstName, lastName, timezone } = parsed.data;
  return updateOwnProfile({
    first_name: firstName,
    last_name: lastName || null,
    display_name: [firstName, lastName].filter(Boolean).join(" "),
    timezone,
  });
}

export async function saveSchedule(input: z.input<typeof rhythmStepSchema>): Promise<Result> {
  const parsed = rhythmStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the schedule." };
  const days = WEEKDAYS.filter((day) => parsed.data.days.includes(day));
  return updateOwnProfile({ posting_slots: days.map((day) => ({ day, time: parsed.data.time })) });
}

/** Settings → Notifications: the optional emails. Failure emails have no switch (D-030). */
export async function saveEmailPreferences(input: EmailPreferences): Promise<Result> {
  const parsed = emailPreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the switches." };
  return updateOwnProfile(preferenceColumns(parsed.data));
}
