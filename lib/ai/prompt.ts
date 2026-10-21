// How Poxeet's AI writes (D-028). One set of rules shared by every job that writes words a member will publish
// (the drafter) or that shapes them (the planner, voice analysis). The member's own voice decides the style;
// these rules decide what never appears, because readers spot machine writing at once.

/** The rules, as given to the model. Kept short: long rule lists make models stiffer, not better. */
export const WRITING_RULES = `How to write (these rules apply on top of the author's voice; the voice decides style, these decide what never appears):
- Sound like one specific person talking to people they know. Plain words, real sentences, varied length. Short is fine.
- Be concrete: one real situation, example or detail beats three general claims. Never pad.
- No em dashes or en dashes as punctuation. Use a full stop, a comma or a new line instead.
- No stock AI phrasing. Never write: "delve", "dive into", "game-changer", "unlock", "unleash", "elevate", "harness", "leverage" (as a verb), "navigate the landscape", "in today's fast-paced world", "it's not just X, it's Y", "let that sink in", "here's the thing", "the secret sauce", "buckle up", "a testament to", "in conclusion", "I hope this helps".
- No rhetorical setups that announce the point ("Here's why:", "The result?", "The truth is:"). Just say it.
- No lists of three adjectives, no rhyming slogans, no motivational filler, no fake suspense.
- No hashtags, emoji or bold unless the author's voice profile shows they use them, and then only as they do.
- Never invent facts about the author. If a detail is missing, write around it.

Example of the difference:
Machine: "In today's fast-paced world, shipping fast isn't just a strategy, it's a mindset. Here's why it's a game-changer 🚀"
Human: "We shipped something small every Friday for a quarter. Most of it was boring. Two of those boring things are now our best features."`;

/** Phrases that mark text as machine-written. A draft containing one is sent back once with the phrases named. */
export const AI_PHRASES = [
  "delve", "dive into", "game-changer", "game changer", "unlock the", "unleash", "elevate your", "harness the",
  "navigate the", "in today's fast-paced", "in today's world", "let that sink in", "here's the thing",
  "secret sauce", "buckle up", "a testament to", "in conclusion", "i hope this helps", "it's not just",
  "the result?", "the truth is:", "here's why:",
];

/** The AI phrases found in a text, lowercased. */
export function aiPhrasesIn(text: string) {
  const lower = text.toLowerCase().replace(/[‘’]/g, "'");
  return AI_PHRASES.filter((phrase) => lower.includes(phrase));
}

/**
 * Removes em and en dashes used as punctuation, which the rules forbid but models still write. A spaced dash
 * becomes a comma; a dash joining two words becomes a hyphen-free space-comma. Ranges like 2024–2025 stay.
 */
export function withoutDashes(text: string) {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/(\S)[—–](\S)/g, "$1, $2")
    .replace(/^[—–]\s*/gm, "")
    .replace(/,\s*,/g, ",");
}
