import { z } from "zod";

// The brief (PRD onboarding step 3): who the member writes for and what posting is for. Stored as JSON on
// profiles.brief. Posts show how someone writes; the brief says where they want to go. Read by voice analysis,
// the planner and the drafter.

export const BRIEF_LANGUAGES = ["English", "French", "German", "Spanish", "Portuguese", "Dutch", "Italian"] as const;

const topic = z.string().trim().min(1).max(60);

export const briefSchema = z.object({
  profession: z.string().trim().max(160, "Keep it under 160 characters."),
  audience: z.string().trim().max(400, "Keep it under 400 characters."),
  goals: z.string().trim().max(400, "Keep it under 400 characters."),
  topics: z.array(topic).max(12, "Up to 12 topics."),
  off_limits: z.array(topic).max(12, "Up to 12 topics."),
  language: z.enum(BRIEF_LANGUAGES),
});

export type Brief = z.infer<typeof briefSchema>;

export const EMPTY_BRIEF: Brief = { profession: "", audience: "", goals: "", topics: [], off_limits: [], language: "English" };

/** The stored brief, filled out with defaults; an old or empty value becomes the empty brief. */
export function readBrief(value: unknown): Brief {
  const parsed = briefSchema.partial().safeParse(value ?? {});
  return { ...EMPTY_BRIEF, ...(parsed.success ? parsed.data : {}) };
}

/** Whether the member has written enough of a brief to guide planning. */
export const briefStarted = (brief: Brief) => Boolean(brief.profession || brief.audience || brief.goals || brief.topics.length);
