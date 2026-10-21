"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button, countCharacters, Icon, Skeleton, Textarea } from "../../../../components/ui";
import {
  checkPost, cleanText, GOOD_VOICE_POSTS, MAX_POST_CHARS, MAX_POSTS, MIN_VOICE_POSTS, MIN_WORDS, POST_PROBLEM, textHash, wordCount,
} from "../../../../lib/import/posts";
import { startVoiceAnalysis, type StartResult } from "../voice/actions";
import { findImported, importPosts } from "./actions";
import { AnalysisNext } from "./analysis-next";

// Setup's voice step (D-023): the member adds their posts one at a time in a sheet, checks the list, then submits.
// The list and any half-written post are kept in this browser until they're submitted, so a closed sheet, a
// reload or a lost tab doesn't lose them.

export const ACTIVITY_URL = "https://www.linkedin.com/in/me/recent-activity/all/";

type Post = { id: string; text: string };
/** The post being written or edited in the sheet. `id` is the post being edited, null for a new one. */
type Draft = { id: string | null; text: string };
type Saved = { posts: Post[]; draft: Draft | null };
/** What was saved, and how starting voice analysis went (null when there weren't enough posts to start it). */
type Done = { added: number; total: number; analysis: StartResult | null };

const subscribeNothing = () => () => {};
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const newId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function load(key: string): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Saved | null;
    if (saved && Array.isArray(saved.posts)) {
      return { posts: saved.posts.filter((post) => typeof post?.id === "string" && typeof post.text === "string"), draft: saved.draft?.text ? saved.draft : null };
    }
  } catch { /* storage blocked or unreadable: start empty */ }
  return { posts: [], draft: null };
}

function store(key: string, saved: Saved) {
  try {
    if (saved.posts.length || saved.draft?.text.trim()) localStorage.setItem(key, JSON.stringify(saved));
    else localStorage.removeItem(key);
  } catch { /* the list still works for this visit */ }
}

/** Where the member is: "2 of 3 posts. Add 1 more to continue." and the matching meter. */
export function VoiceProgress({ total }: { total: number }) {
  const line = total < MIN_VOICE_POSTS
    ? `${total} of ${MIN_VOICE_POSTS} posts. Add ${MIN_VOICE_POSTS - total} more to continue.`
    : total < GOOD_VOICE_POSTS
      ? `${plural(total, "post")}: enough to start. ${GOOD_VOICE_POSTS}+ gives a sharper voice.`
      : `${plural(total, "post")}: plenty for a sharp voice. Add more any time.`;
  return (
    <div className="wr-voice-progress">
      <span className="wr-voice-meter" aria-hidden="true">
        {Array.from({ length: GOOD_VOICE_POSTS }, (_, index) => (
          <span key={index} data-on={index < total || undefined} data-start={index === MIN_VOICE_POSTS - 1 || undefined} />
        ))}
      </span>
      <span className="wr-small" role="status">{line}</span>
    </div>
  );
}

/** Wait for the browser: the list lives in this browser's storage, so the server can't draw it. */
export function VoicePosts({ userId, imported }: { userId: string; imported: number }) {
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!inBrowser) {
    return (
      <section className="wr-card wr-stack" aria-busy="true" aria-label="Loading">
        <Skeleton width={160} height={20} /><Skeleton width="70%" height={14} /><Skeleton height={44} /><Skeleton height={120} />
      </section>
    );
  }
  return <PostList storageKey={`poxeet:voice-posts:${userId}`} imported={imported} />;
}

function PostList({ storageKey, imported }: { storageKey: string; imported: number }) {
  const [saved, setSaved] = useState(() => load(storageKey));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const { posts, draft } = saved;

  useEffect(() => store(storageKey, saved), [storageKey, saved]);
  const keepDraft = useCallback((text: string) => setSaved((current) => ({ ...current, draft: { id: current.draft?.id ?? null, text } })), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const total = imported + posts.length;
  const stepDone = imported >= MIN_VOICE_POSTS;
  const canSubmit = posts.length > 0 && total >= MIN_VOICE_POSTS;

  function openNew() {
    // A half-written new post comes back; changes to a post being edited don't carry over to a new one.
    if (draft?.id) setSaved((current) => ({ ...current, draft: null }));
    setSheetOpen(true);
  }

  function openEdit(post: Post) {
    if (draft?.id !== post.id) setSaved((current) => ({ ...current, draft: { id: post.id, text: post.text } }));
    setSheetOpen(true);
  }

  function savePost(text: string) {
    setSaved((current) => {
      const editing = current.draft?.id;
      const posts = editing ? current.posts.map((post) => (post.id === editing ? { ...post, text } : post)) : [...current.posts, { id: newId(), text }];
      return { posts, draft: null };
    });
    setSheetOpen(false);
    toast.success(draft?.id ? "Post updated." : `Post added. ${plural(posts.length + (draft?.id ? 0 : 1), "post")} in your list.`);
  }

  function remove(post: Post) {
    const index = posts.indexOf(post);
    setSaved((current) => ({ ...current, posts: current.posts.filter((item) => item.id !== post.id), draft: current.draft?.id === post.id ? null : current.draft }));
    toast("Post removed.", {
      action: {
        label: "Undo",
        onClick: () => setSaved((current) => ({ ...current, posts: [...current.posts.slice(0, index), post, ...current.posts.slice(index)] })),
      },
    });
  }

  async function submit() {
    setSubmitting(true);
    try {
      const result = await importPosts({ source: "manual", posts: posts.map((post) => ({ text: post.text, postedAt: null, url: null })) });
      if (!result.ok) return void toast.error(result.message);
      setSaved({ posts: [], draft: null });
      // Submit for analysis: with enough posts saved, start voice analysis straight away.
      const analysis = result.total >= MIN_VOICE_POSTS
        ? await startVoiceAnalysis().catch((): StartResult => ({ ok: false, reason: "error", message: "We couldn't start the analysis." }))
        : null;
      setDone({ added: result.added, total: result.total, analysis });
      toast.success(result.added === 1 ? "1 post saved." : `${result.added} posts saved.`, {
        description: analysis?.ok ? "Analysing your voice now." : undefined,
      });
    } catch {
      toast.error("Something went wrong on our side. Your posts are still here. Try again in a minute.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <Submitted done={done} onMore={() => setDone(null)} />;

  const others = posts.filter((post) => post.id !== draft?.id).map((post) => post.text);

  return (
    <section className="wr-card wr-stack" aria-labelledby="voice-h">
      <div className="wr-card-head">
        <div>
          <h2 id="voice-h" className="wr-h2">{stepDone ? "Add more of your posts" : "Add your posts"}</h2>
          <p className="wr-sub wr-small">
            {stepDone
              ? `Poxeet already has ${plural(imported, "post")} to learn from. More posts give a sharper voice; nothing is removed.`
              : `Add at least ${MIN_VOICE_POSTS} posts you wrote yourself, one at a time.`}
          </p>
        </div>
      </div>

      <ol className="wr-voice-how">
        <li>
          <span className="wr-mono">1</span>
          <span>
            Open your <a href={ACTIVITY_URL} target="_blank" rel="noreferrer" className="wr-link">LinkedIn profile → Activity → Posts</a> in a new tab.
          </span>
        </li>
        <li><span className="wr-mono">2</span><span>Copy one post you wrote. Click <strong>…see more</strong> first so you get all of it.</span></li>
        <li><span className="wr-mono">3</span><span>Come back, press <strong>Add post</strong> and paste it. Repeat for each post.</span></li>
      </ol>

      <VoiceProgress total={total} />

      {posts.length === 0 ? (
        <div className="wr-voice-empty">
          <span className="wr-dropzone-icon"><Icon name="doc" size={20} /></span>
          <strong>No posts added yet</strong>
          <span className="wr-small">Pick posts that sound most like you: your own words, not reposts. Different topics help.</span>
          {draft && !draft.id && <span className="wr-small wr-voice-draft-note"><Icon name="pencil" size={12} />You have a post you didn&apos;t finish. Add post opens it.</span>}
        </div>
      ) : (
        <ol className="wr-voice-list" aria-label="Posts to submit">
          {posts.map((post, index) => (
            <li key={post.id}>
              <span className="wr-mono wr-voice-num">{index + 1}</span>
              <span className="wr-voice-text">{post.text}</span>
              <span className="wr-voice-meta wr-small wr-muted">{plural(wordCount(post.text), "word")}</span>
              <span className="wr-voice-actions">
                <button type="button" className="wr-icon-btn" aria-label={`Edit post ${index + 1}`} onClick={() => openEdit(post)}><Icon name="pencil" size={16} /></button>
                <button type="button" className="wr-icon-btn" aria-label={`Remove post ${index + 1}`} onClick={() => remove(post)}><Icon name="x" size={16} /></button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="wr-voice-bar">
        <Button variant={posts.length ? "secondary" : "primary"} icon="plus" onClick={openNew} disabled={posts.length >= MAX_POSTS}>
          {draft && !draft.id ? "Continue your post" : "Add post"}
        </Button>
        <span className="wr-voice-submit">
          {posts.length > 0 && !canSubmit && <span className="wr-small wr-muted">Submit opens at {MIN_VOICE_POSTS} posts.</span>}
          <Button onClick={submit} loading={submitting} disabled={!canSubmit} iconRight="arrow-right">Submit for analysis</Button>
        </span>
      </div>
      {posts.length > 0 && <p className="wr-small wr-muted" style={{ margin: 0 }}>Your list is kept in this browser until you submit.</p>}

      {sheetOpen && (
        <PostSheet
          draft={draft}
          others={others}
          number={draft?.id ? posts.findIndex((post) => post.id === draft.id) + 1 : posts.length + 1}
          onDraft={keepDraft}
          onDiscard={() => { setSaved((current) => ({ ...current, draft: null })); setSheetOpen(false); }}
          onSave={savePost}
          onClose={closeSheet}
        />
      )}
    </section>
  );
}

function Submitted({ done, onMore }: { done: Done; onMore: () => void }) {
  return (
    <section className="wr-card wr-stack" aria-labelledby="sent-h">
      <div className="wr-callout" data-tone="success">
        <span className="wr-callout-icon"><Icon name="check" size={18} strokeWidth={2.4} /></span>
        <span>
          <strong id="sent-h">{done.added === 1 ? "1 post saved" : `${done.added} posts saved`}</strong>
          <span>Poxeet now has {plural(done.total, "post")} to learn from.{done.total < GOOD_VOICE_POSTS ? ` Adding more, up to ${GOOD_VOICE_POSTS} or so, sharpens your voice.` : ""}</span>
        </span>
      </div>
      <AnalysisNext analysis={done.analysis} onMore={onMore} moreLabel="Add more posts" />
    </section>
  );
}

type SheetProps = {
  draft: Draft | null;
  /** The other posts in the list, for the duplicate check. */
  others: string[];
  number: number;
  onDraft: (text: string) => void;
  onDiscard: () => void;
  onSave: (text: string) => void;
  onClose: () => void;
};

/** One post: paste, see the word count, save. Closing keeps the text as a draft; Discard throws it away. */
function PostSheet({ draft, others, number, onDraft, onDiscard, onSave, onClose }: SheetProps) {
  const id = useId();
  const sheet = useRef<HTMLFormElement>(null);
  const editing = Boolean(draft?.id);
  // Decided once on opening: the draft fills in as they type, which isn't "resuming".
  const [resumed] = useState(() => Boolean(draft?.text.trim()) && !editing);
  const schema = z.object({
    text: z.string().superRefine((value, ctx) => {
      if (!cleanText(value)) return void ctx.addIssue({ code: "custom", message: "Paste one of your posts first." });
      const problem = checkPost(value, others);
      if (problem) ctx.addIssue({ code: "custom", message: POST_PROBLEM[problem] });
    }),
  });
  const form = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { text: draft?.text ?? "" }, reValidateMode: "onChange" });
  const text = useWatch({ control: form.control, name: "text" });
  const words = wordCount(cleanText(text));
  const short = words > 0 && words < MIN_WORDS;

  // Escape closes; the page behind doesn't scroll; focus comes back where it was.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  async function save({ text }: { text: string }) {
    const clean = cleanText(text);
    // Already saved to Poxeet earlier? The server would skip it anyway; say so now instead.
    try {
      const [found] = await findImported([await textHash(clean)]);
      if (found) return form.setError("text", { message: "Poxeet already has this post from an earlier import." });
    } catch { /* the server skips repeats on submit */ }
    onSave(clean);
  }

  return createPortal(
    <div className="wr-sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={sheet} className="wr-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} onSubmit={form.handleSubmit(save)} noValidate>
        <div className="wr-sheet-head">
          <div>
            <h2 id={`${id}-title`} className="wr-h2">{editing ? `Edit post ${number}` : `Add post ${number}`}</h2>
            <p className="wr-small wr-muted">One post per box. Paste it exactly as it is on LinkedIn.</p>
          </div>
          <button type="button" className="wr-icon-btn" aria-label="Close, keeping your text" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="wr-sheet-body">
          {resumed && (
            <div className="wr-voice-note" role="note">
              <Icon name="pencil" size={16} />
              <span>Here&apos;s the post you started earlier.</span>
            </div>
          )}
          <Textarea
            label="Your post" rows={14} limit={MAX_POST_CHARS} autoFocus className="wr-voice-field"
            placeholder="Paste one LinkedIn post here"
            hint={words === 0 ? `At least ${MIN_WORDS} words.` : short ? `${plural(words, "word")}. ${MIN_WORDS - words} more to go.` : plural(words, "word")}
            error={form.formState.errors.text?.message ?? (countCharacters(text) > MAX_POST_CHARS ? POST_PROBLEM.too_long : undefined)}
            value={text}
            // Every keystroke goes to the draft, so closing by accident (Escape, the backdrop, a reload) loses nothing.
            {...form.register("text", { onChange: (event) => onDraft(event.target.value) })}
          />
          <p className="wr-small wr-muted" style={{ margin: 0 }}>
            Not sure where to find it? <a href={ACTIVITY_URL} target="_blank" rel="noreferrer" className="wr-link">Open your posts on LinkedIn</a>.
            If you close this panel, your text is kept.
          </p>
        </div>

        <div className="wr-sheet-foot">
          {text.trim() && !editing ? <Button variant="ghost" onClick={onDiscard}>Discard</Button> : <Button variant="ghost" onClick={onClose}>Cancel</Button>}
          <Button type="submit" loading={form.formState.isSubmitting} icon="check">{editing ? "Save changes" : "Save post"}</Button>
        </div>
      </form>
    </div>,
    document.querySelector(".wr-shell") ?? document.body,
  );
}
