import { z } from "zod";

// The voice profile (PRD section 9, schema_version 1): how one member writes, precise enough for the drafter to
// imitate. Validated in code on every write, because the database only checks that it's an object with a
// schema_version. Lenient where the model may leave things out (defaults), strict on types.

const text = z.string().trim().max(600);
const shortList = (max = 12) => z.array(z.string().trim().min(1).max(300)).max(max).default([]);
const level = z.number().int().min(1).max(5);
const frequency = z.enum(["never", "rare", "sometimes", "often"]);

export const voiceProfileSchema = z.object({
  schema_version: z.literal(1),
  summary: text.min(1),
  confidence: z.enum(["low", "medium", "high"]),
  tone: z.object({
    descriptors: shortList(8),
    formality: level,
    humor: level,
    emotionality: level,
    notes: text.default(""),
  }),
  structure: z.object({
    length_words: z.object({ min: z.number().int().min(0), median: z.number().int().min(0), max: z.number().int().min(0) }),
    hook_styles: shortList(8),
    paragraphing: text.default(""),
    ending_styles: shortList(8),
    uses_lists: frequency,
  }),
  language: z.object({
    primary: z.string().trim().min(2).max(12),
    person: z.enum(["first_person_singular", "first_person_plural", "second_person", "third_person", "mixed"]),
    favorite_phrases: shortList(12),
    avoid_words: shortList(20),
    jargon_level: z.enum(["low", "moderate", "high"]),
  }),
  formatting: z.object({
    emoji: z.object({ frequency, favorites: shortList(8) }),
    hashtags: z.object({ typical_count: z.number().int().min(0).max(30), placement: z.enum(["none", "inline", "end", "mixed"]) }),
    links: frequency,
    mentions: frequency,
  }),
  topics: z.object({ recurring: shortList(12), expertise_ok: shortList(12), off_limits: shortList(12) }),
  persona: z.object({ role: text.default(""), audience: text.default(""), point_of_view: text.default(""), values: shortList(8) }),
  rules: z.object({ always: shortList(12), never: shortList(12) }),
  signature_moves: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    description: text.min(1),
    example_post_ids: z.array(z.string().trim().min(1)).min(1).max(8),
  })).max(8).default([]),
  evidence: z.object({ sampled_post_ids: z.array(z.string()).default([]), stats: z.record(z.string(), z.unknown()).default({}) }).default({ sampled_post_ids: [], stats: {} }),
  locked_fields: z.array(z.string()).default([]),
});

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

/** Top-level fields a member can lock by editing them, so re-analysis keeps their version. */
export const EDITABLE_FIELDS = ["summary", "tone", "structure", "language", "formatting", "topics", "persona", "rules", "signature_moves"] as const;

export type ParsedProfile = { ok: true; profile: VoiceProfile } | { ok: false; problem: string };

/** The first JSON object in a model's answer (models sometimes wrap it in a code fence or a sentence). */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/**
 * Checks the analyst's answer: valid JSON, schema-valid, and (PRD step 5) every signature move cites ids from the
 * sample. Returns a short problem description on failure, which the retry is told about.
 */
export function parseProfile(raw: string, sampledIds: ReadonlySet<string>): ParsedProfile {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch {
    return { ok: false, problem: "The answer wasn't a JSON object." };
  }
  const parsed = voiceProfileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, problem: `Field ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "invalid"}.` };
  }
  const unknown = parsed.data.signature_moves.flatMap((move) => move.example_post_ids).filter((id) => !sampledIds.has(id));
  if (unknown.length) return { ok: false, problem: `signature_moves cite post ids that weren't in the sample: ${unknown.slice(0, 5).join(", ")}.` };
  return { ok: true, profile: parsed.data };
}

/** PRD voice-analyst rule 8, applied in code: low under 10 posts, medium to 40, high above (the model may go lower). */
export function confidenceFor(postCount: number, claimed: VoiceProfile["confidence"]): VoiceProfile["confidence"] {
  const ceiling = postCount < 10 ? "low" : postCount <= 40 ? "medium" : "high";
  const order = ["low", "medium", "high"] as const;
  return order[Math.min(order.indexOf(ceiling), order.indexOf(claimed))];
}
