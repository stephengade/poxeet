import { parseCsv } from "./csv";

// Turning a LinkedIn export or pasted text into post candidates for the "check what was found" screen.
// Runs in the browser (instant preview, no upload) and again on the server, which never trusts the browser's result.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** The most posts one import saves; the newest are kept. */
export const MAX_POSTS = 500;
/** LinkedIn's own limit for a post. */
export const MAX_POST_CHARS = 3000;
export const MIN_WORDS = 15;
/** Posts a member needs before setup's voice step is done (D-023). More gives a sharper voice. */
export const MIN_VOICE_POSTS = 3;
export const GOOD_VOICE_POSTS = 10;

/** "manual" is one post at a time from Add post; "paste" is the older one-box paste, kept for rows saved by it. */
export type Source = "linkedin_export" | "paste" | "manual";

/** Why a found post is left out by default. "short" can be included by hand; the others can't be. */
export type LeftOut = "repost" | "link_only" | "short" | "duplicate" | "too_long";

export type Candidate = {
  /** Stable within one parse, for list keys and selection. */
  key: string;
  text: string;
  postedAt: string | null;
  url: string | null;
  leftOut: LeftOut | null;
};

export type ParseResult =
  | { ok: true; source: Source; candidates: Candidate[] }
  | { ok: false; reason: "empty" | "no_text_column" | "not_csv"; headers?: string[] };

export const LEFT_OUT_LABEL: Record<LeftOut, string> = {
  repost: "Reposts without your own text",
  link_only: "Link only",
  short: `Under ${MIN_WORDS} words`,
  duplicate: "Duplicates",
  too_long: `Over ${MAX_POST_CHARS.toLocaleString("en-US")} characters`,
};

/** Only "short" posts may be ticked back in; the rest have nothing usable to learn from. */
export const CAN_INCLUDE: Record<LeftOut, boolean> = { repost: false, link_only: false, short: true, duplicate: false, too_long: false };

/** Plain text as stored: no control characters, LF line ends, no trailing spaces, at most one blank line in a row. */
export function cleanText(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const isOnlyLink = (text: string) => /^(https?:\/\/\S+\s*)+$/i.test(text);

/** The dedupe key: case and spacing don't make a post new. Matches imported_posts.text_hash. */
export async function textHash(text: string) {
  const normalised = cleanText(text).toLowerCase().replace(/\s+/g, " ");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalised));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function classify(text: string, seen: Set<string>): LeftOut | null {
  // In LinkedIn's export a row without text is a repost of someone else's post.
  if (!text) return "repost";
  if (isOnlyLink(text)) return "link_only";
  if (text.length > MAX_POST_CHARS) return "too_long";
  const key = text.toLowerCase().replace(/\s+/g, " ");
  if (seen.has(key)) return "duplicate";
  seen.add(key);
  if (wordCount(text) < MIN_WORDS) return "short";
  return null;
}

/** Why one post added by hand can't be saved, as a sentence for the field. */
export const POST_PROBLEM: Record<LeftOut, string> = {
  repost: "Paste the text of a post you wrote.",
  link_only: "That's only a link. Paste the post's text so Poxeet can learn from your words.",
  short: `Add at least ${MIN_WORDS} words. Very short posts don't show much of how you write.`,
  duplicate: "You've already added this post.",
  too_long: `That's over LinkedIn's ${MAX_POST_CHARS.toLocaleString("en-US")}-character limit. Check only one post is in the box.`,
};

/**
 * Checks one post added by hand against the same rules as an import. `others` are the posts already in the list
 * (minus the one being edited). Unlike an export, a short post can't be ticked back in: the member can just add words.
 */
export function checkPost(raw: string, others: readonly string[]): LeftOut | null {
  const seen = new Set(others.map((text) => cleanText(text).toLowerCase().replace(/\s+/g, " ")));
  return classify(cleanText(raw), seen);
}

/** LinkedIn writes "2024-03-15 10:23:45" in UTC. Anything else Date can read is accepted too. */
function parseDate(value: string | undefined) {
  if (!value?.trim()) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value.trim()) ? `${value.trim().replace(" ", "T")}Z` : value.trim();
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const pick = (headers: string[], names: string[]) => headers.findIndex((header) => names.includes(header.trim().toLowerCase().replace(/[\s_]/g, "")));

/** The Shares file from LinkedIn's data export: Date, ShareLink, ShareCommentary, SharedUrl, MediaUrl, Visibility. */
export function parseSharesCsv(content: string): ParseResult {
  const rows = parseCsv(content);
  if (rows.length === 0) return { ok: false, reason: "empty" };
  const headers = rows[0];
  if (headers.length < 2) return { ok: false, reason: "not_csv", headers };
  const textAt = pick(headers, ["sharecommentary", "commentary", "text", "content", "post"]);
  if (textAt < 0) return { ok: false, reason: "no_text_column", headers };
  const dateAt = pick(headers, ["date", "createddate", "publisheddate"]);
  const linkAt = pick(headers, ["sharelink", "link", "url", "posturl"]);

  const found = rows.slice(1).map((row, index) => ({
    key: `csv-${index}`,
    text: cleanText(row[textAt] ?? ""),
    postedAt: parseDate(row[dateAt]),
    url: row[linkAt]?.trim() || null,
  }));
  if (found.length === 0) return { ok: false, reason: "empty" };
  // Newest first, before classifying: the cap keeps recent posts, and of two copies the newer one is kept.
  found.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  const seen = new Set<string>();
  const candidates = found.map((post): Candidate => ({ ...post, leftOut: classify(post.text, seen) }));
  return { ok: true, source: "linkedin_export", candidates };
}

/** Pasted posts, separated by a line of three or more dashes (---). */
export function parsePasted(content: string): ParseResult {
  const blocks = cleanText(content).split(/\n\s*-{3,}\s*\n/).map((block) => cleanText(block)).filter(Boolean);
  if (blocks.length === 0) return { ok: false, reason: "empty" };
  const seen = new Set<string>();
  return {
    ok: true,
    source: "paste",
    candidates: blocks.map((text, index) => ({ key: `paste-${index}`, text, postedAt: null, url: null, leftOut: classify(text, seen) })),
  };
}
