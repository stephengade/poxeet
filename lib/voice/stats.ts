import { wordCount } from "../import/posts";

// Measured facts about a member's posts (PRD section 9, step 2): computed in code, never by the model, and given
// to the analyst as ground truth. Pure, so it's tested directly.

export type VoicePost = { id: string; text: string; postedAt: string | null };

export type VoiceStats = {
  post_count: number;
  words: { min: number; median: number; max: number };
  /** Line breaks per 100 words. */
  line_breaks_per_100_words: number;
  /** Share of posts with at least one emoji, 0 to 1. */
  emoji_post_share: number;
  hashtags: { average_per_post: number; placement: "none" | "inline" | "end" | "mixed" };
  /** Share of posts whose first line is a question. */
  question_opener_share: number;
  first_line_words_median: number;
  /** Share of posts that end with a question. */
  question_ending_share: number;
  /** Share of posts with a list (lines starting with -, •, a number or an emoji bullet). */
  list_post_share: number;
  /** Share of posts with a link. */
  link_post_share: number;
};

const EMOJI = /\p{Extended_Pictographic}/u;
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const LINK = /https?:\/\/\S+/i;
const LIST_LINE = /^\s*(?:[-•*▪►→✅✔️]|\d+[.)]|\p{Extended_Pictographic})\s+\S/mu;

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const share = (posts: VoicePost[], test: (post: VoicePost) => boolean) => (posts.length ? round(posts.filter(test).length / posts.length) : 0);

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

const firstLine = (text: string) => text.split("\n").find((line) => line.trim())?.trim() ?? "";
const lastLine = (text: string) => text.split("\n").filter((line) => line.trim()).at(-1)?.trim() ?? "";

/** Where hashtags sit: only in the last paragraph ("end"), only earlier ("inline"), both ("mixed"), or none. */
function hashtagPlacement(posts: VoicePost[]): VoiceStats["hashtags"]["placement"] {
  let end = 0;
  let inline = 0;
  for (const post of posts) {
    const paragraphs = post.text.split(/\n\s*\n/);
    const last = paragraphs.at(-1) ?? "";
    const body = paragraphs.slice(0, -1).join("\n");
    if ((last.match(HASHTAG) ?? []).length) end++;
    if ((body.match(HASHTAG) ?? []).length) inline++;
  }
  if (!end && !inline) return "none";
  if (end && inline) return end >= inline * 3 ? "end" : inline >= end * 3 ? "inline" : "mixed";
  return end ? "end" : "inline";
}

export function computeStats(posts: VoicePost[]): VoiceStats {
  const words = posts.map((post) => wordCount(post.text));
  const totalWords = words.reduce((sum, value) => sum + value, 0);
  const lineBreaks = posts.reduce((sum, post) => sum + (post.text.match(/\n/g) ?? []).length, 0);
  const hashtags = posts.reduce((sum, post) => sum + (post.text.match(HASHTAG) ?? []).length, 0);
  return {
    post_count: posts.length,
    words: { min: words.length ? Math.min(...words) : 0, median: median(words), max: words.length ? Math.max(...words) : 0 },
    line_breaks_per_100_words: totalWords ? round((lineBreaks / totalWords) * 100, 1) : 0,
    emoji_post_share: share(posts, (post) => EMOJI.test(post.text)),
    hashtags: { average_per_post: posts.length ? round(hashtags / posts.length, 1) : 0, placement: hashtagPlacement(posts) },
    question_opener_share: share(posts, (post) => firstLine(post.text).endsWith("?")),
    first_line_words_median: median(posts.map((post) => wordCount(firstLine(post.text)))),
    question_ending_share: share(posts, (post) => lastLine(post.text).replace(/(\s#[\p{L}\p{N}_]+)+$/u, "").trim().endsWith("?")),
    list_post_share: share(posts, (post) => LIST_LINE.test(post.text)),
    link_post_share: share(posts, (post) => LINK.test(post.text)),
  };
}

/** The most posts sent to the analyst, and roughly how much text (PRD step 3: cap the prompt size). */
export const SAMPLE_MAX_POSTS = 60;
export const SAMPLE_MAX_CHARS = 60_000;

/**
 * Picks the posts the analyst reads (PRD step 3): the most recent, the longest, then an even spread across the
 * rest, until the post or character cap. Returns them in a stable order with short ids (p1, p2...) for the
 * prompt, mapped back to the real post ids.
 */
export function pickSample(posts: VoicePost[], maxPosts = SAMPLE_MAX_POSTS, maxChars = SAMPLE_MAX_CHARS) {
  const byDate = [...posts].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  const byLength = [...posts].sort((a, b) => b.text.length - a.text.length);
  const chosen = new Map<string, VoicePost>();
  let chars = 0;
  const take = (post: VoicePost | undefined) => {
    if (!post || chosen.has(post.id) || chosen.size >= maxPosts || chars + post.text.length > maxChars) return;
    chosen.set(post.id, post);
    chars += post.text.length;
  };
  const third = Math.max(1, Math.floor(maxPosts / 3));
  byDate.slice(0, third).forEach(take);
  byLength.slice(0, third).forEach(take);
  // An even spread over everything else, by position in the date order.
  const rest = byDate.filter((post) => !chosen.has(post.id));
  const room = maxPosts - chosen.size;
  if (room > 0 && rest.length) {
    const step = rest.length / Math.min(room, rest.length);
    for (let index = 0; index < rest.length && chosen.size < maxPosts; index += step) take(rest[Math.floor(index)]);
  }
  const sample = byDate.filter((post) => chosen.has(post.id)).map((post, index) => ({ ...post, sampleId: `p${index + 1}` }));
  return { sample, idMap: new Map(sample.map((post) => [post.sampleId, post.id])) };
}
