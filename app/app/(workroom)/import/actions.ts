"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanText, MAX_POST_CHARS, MAX_POSTS, textHash } from "../../../../lib/import/posts";
import { blockingStep, getMember } from "../../../../lib/member";
import { createClient } from "../../../../lib/supabase/server";

// Import runs as the member (Row Level Security limits every read and write to their own rows).
// The browser parses and previews; the server cleans, checks and hashes everything again before saving.

const HASH = /^[0-9a-f]{64}$/;
const CHUNK = 100;

async function member() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Which of these text hashes the member has already imported, so the preview can mark them. */
export async function findImported(hashes: string[]): Promise<string[]> {
  const wanted = Array.from(new Set(hashes.filter((hash) => HASH.test(hash)))).slice(0, MAX_POSTS * 2);
  const { supabase, user } = await member();
  if (!user || wanted.length === 0) return [];
  const found: string[] = [];
  // In chunks: the filter travels in the URL.
  for (let start = 0; start < wanted.length; start += CHUNK) {
    const { data } = await supabase.from("imported_posts").select("text_hash").eq("user_id", user.id).in("text_hash", wanted.slice(start, start + CHUNK));
    found.push(...(data ?? []).map((row) => row.text_hash as string));
  }
  return found;
}

const importSchema = z.object({
  source: z.enum(["linkedin_export", "paste", "manual"]),
  posts: z.array(z.object({
    text: z.string().min(1).max(MAX_POST_CHARS * 2),
    postedAt: z.iso.datetime().nullable(),
    url: z.url().max(2048).nullable(),
  })).min(1, "Pick at least one post.").max(MAX_POSTS, `Import up to ${MAX_POSTS} posts at a time.`),
});

export type ImportInput = z.input<typeof importSchema>;
export type ImportResult = { ok: true; added: number; alreadyThere: number; total: number } | { ok: false; message: string };

/** Saves the chosen posts. Re-importing never deletes or changes earlier posts; repeats are skipped. */
export async function importPosts(input: ImportInput): Promise<ImportResult> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Those posts couldn't be read." };
  const { supabase, user } = await member();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again." };
  // Setup goes in order: importing needs LinkedIn connected and AI access first.
  const blocker = blockingStep(await getMember(), "import");
  if (blocker) return { ok: false, message: `${blocker.title} first. This step unlocks after that.` };

  const rows = new Map<string, { user_id: string; source: string; text: string; text_hash: string; posted_at: string | null; url: string | null }>();
  for (const post of parsed.data.posts) {
    const text = cleanText(post.text);
    if (!text || text.length > MAX_POST_CHARS) continue;
    const hash = await textHash(text);
    if (!rows.has(hash)) rows.set(hash, { user_id: user.id, source: parsed.data.source, text, text_hash: hash, posted_at: post.postedAt, url: post.url });
  }
  if (rows.size === 0) return { ok: false, message: "None of those posts had text to import." };

  const { data, error } = await supabase
    .from("imported_posts")
    .upsert(Array.from(rows.values()), { onConflict: "user_id,text_hash", ignoreDuplicates: true })
    .select("id");
  if (error) return { ok: false, message: "We couldn't save your posts. Try again in a moment." };

  // The step is done once the member has MIN_VOICE_POSTS in all, so report the new total.
  const { count } = await supabase.from("imported_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  revalidatePath("/app", "layout");
  const added = data?.length ?? 0;
  return { ok: true, added, alreadyThere: parsed.data.posts.length - added, total: count ?? added };
}
