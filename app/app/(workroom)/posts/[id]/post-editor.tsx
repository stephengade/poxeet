"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { LinkedInLogo } from "../../../../../components/brand/channel-logos";
import { mondayIndex, parseIsoDate, WEEKDAYS } from "../../../../../components/calendar/dates";
import { PostPreview } from "../../../../../components/post/post-preview";
import { longDay, StatusTag } from "../../../../../components/preview/parts";
import { Banner, Button, countCharacters, Icon } from "../../../../../components/ui";
import type { PostStatus } from "../../../../../lib/post-status";
import { Reschedule } from "../../../../../components/workroom/reschedule";
import { PostFlags, PostTags, PostWhy } from "../../../../../components/workroom/post-notes";
import { markPostedByHand, regeneratePost, resolveNeedsCheck, savePostText, setPostStatus } from "../actions";

type EditorPost = {
  id: string; text: string; date: string; time: string; status: PostStatus; pillar: string | null; postType: string | null;
  angle: string | null; rationale: string | null; needsInput: string | null; flags: string[]; error: string | null;
  link: string | null; postedVia: string | null; postedAt: { date: string; time: string } | null;
};

const QUICK = ["Shorter", "Stronger opening", "More like me", "End on a question"];
const LOCKED: PostStatus[] = ["posted", "posting", "needs_check"];

export function PostEditor({ post, author, timezone, linkedinConnected, tone }: { post: EditorPost; author: { name: string; initials: string }; timezone: string; linkedinConnected: boolean; tone?: number }) {
  const router = useRouter();
  const [saved, setSaved] = useState(post.text);
  const [text, setText] = useState(post.text);
  const [status, setStatus] = useState(post.status);
  const [needsInput, setNeedsInput] = useState(post.needsInput);
  const [note, setNote] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [pending, start] = useTransition();

  const locked = LOCKED.includes(status);
  const changed = text !== saved;
  const count = countCharacters(text);
  const over = count > 3000;
  const empty = !text.trim();

  /** Saves the text if it changed; editing an approved post sends it back to draft. */
  async function persist() {
    if (!changed) return true;
    const result = await savePostText(post.id, text);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    setSaved(text);
    setNeedsInput(null);
    if (status === "approved") setStatus("draft");
    return true;
  }

  function save() {
    start(async () => {
      const wasApproved = status === "approved";
      if (await persist()) toast.success(wasApproved ? "Saved. Edited posts come back for review." : "Saved.");
      router.refresh();
    });
  }

  function decide(next: "approved" | "skipped" | "draft") {
    start(async () => {
      if (next === "approved" && (over || empty)) return;
      if (next !== "skipped" && !(await persist())) return;
      const result = await setPostStatus([post.id], next);
      if (!result.ok) return void toast.error(result.message);
      setStatus(next);
      toast.success(next === "approved" ? "Approved. It goes out at its slot." : next === "skipped" ? "Skipped. It won't be sent." : "Back in drafts.");
      router.refresh();
      if (next !== "draft") router.push("/app/drafts");
    });
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>, done: string, after?: () => void) {
    start(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(result.message ?? "Something went wrong.");
      toast.success(done);
      after?.();
      router.refresh();
    });
  }

  async function rewrite(instruction: string) {
    setRewriting(true);
    const result = await regeneratePost(post.id, instruction);
    setRewriting(false);
    if (!result.ok || !result.text) return void toast.error(result.ok ? "No new version came back." : result.message);
    setText(result.text);
    setSaved(result.text);
    setStatus("draft");
    setNeedsInput(null);
    setNote("");
    toast.success(instruction ? `Rewritten: ${instruction.toLowerCase()}.` : "Rewritten.");
    router.refresh();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !locked && !rewriting) {
        event.preventDefault();
        decide("approved");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const day = parseIsoDate(post.date);
  return (
    <div className="wr-page">
      <div className="wr-head">
        <div>
          <Link href="/app/drafts" className="wr-back"><Icon name="chevron-left" size={14} strokeWidth={2} />Back to drafts</Link>
          <div className="wr-title-row"><h1 className="wr-title">{locked ? "Sent post" : "Edit post"}</h1><StatusTag status={status} /></div>
          <div className="wr-inline wr-editor-when">
            <Reschedule postId={post.id} date={post.date} time={post.time} timezone={timezone} disabled={locked || status === "needs_check"}
              onMoved={() => { if (status === "missed") setStatus("approved"); }} />
            <span className="wr-small wr-muted">on LinkedIn</span>
          </div>
        </div>
        {!locked && (
          <div className="wr-actions">
            {status !== "skipped" && status !== "needs_check" && <Button variant="ghost" onClick={() => decide("skipped")} disabled={pending || rewriting}>Skip</Button>}
            {status === "skipped" && <Button variant="ghost" onClick={() => decide("draft")} disabled={pending}>Restore</Button>}
            {status !== "needs_check" && <Button variant="secondary" disabled={!changed || over || empty || pending || rewriting} onClick={save}>Save</Button>}
            {status !== "skipped" && status !== "needs_check" && (
              <Button variant="brand" icon="check" disabled={over || empty || rewriting} loading={pending} onClick={() => decide("approved")} title="Ctrl + Enter">
                {status === "approved" && !changed ? "Approved" : "Approve"}
              </Button>
            )}
          </div>
        )}
      </div>

      {status === "approved" && changed && <Banner tone="warning" title="Saving moves this post back to drafts">An approved post you edit needs approving again before it goes out.</Banner>}
      {status === "posting" && <Banner tone="info" title="Being sent now">LinkedIn is receiving this post. It can&apos;t be changed until the send finishes.</Banner>}
      {status === "posted" && (
        <Banner tone="success" title={post.postedVia === "manual" ? "Posted by hand" : "Posted on LinkedIn"}
          action={post.link ? <Button size="sm" variant="secondary" href={post.link}>View on LinkedIn</Button> : undefined}>
          {post.postedAt ? `Went out ${longDay(post.postedAt.date)} at ${post.postedAt.time}. ` : ""}Posted text can&apos;t be changed here; edit it on LinkedIn.
        </Banner>
      )}
      {status === "needs_check" && (
        <Banner tone="warning" title="Did this go out?" action={
          <span className="wr-actions">
            <Button size="sm" loading={pending} onClick={() => run(() => resolveNeedsCheck(post.id, "posted"), "Marked as posted.", () => setStatus("posted"))}>It went out</Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => resolveNeedsCheck(post.id, "approved"), "It goes out on the next run.", () => setStatus("approved"))}>Send again</Button>
          </span>
        }>
          {post.error ?? "We couldn't confirm the send."} Look at your LinkedIn profile, then tell Poxeet what happened. It won&apos;t be sent again until you do.
        </Banner>
      )}
      {status === "missed" && <Banner tone="warning" title="This post missed its slot">It was more than a day late, so it wasn&apos;t sent. Move it to a new time, post it by hand, or skip it.</Banner>}
      {status === "approved" && !linkedinConnected && (
        <Banner tone="warning" title="LinkedIn isn&apos;t connected" action={<Button size="sm" href="/app/settings/channels">Reconnect</Button>}>
          Approved posts can&apos;t go out until you reconnect. You can still copy this one and post it by hand.
        </Banner>
      )}
      {needsInput && !locked && <Banner tone="warning" title="Needs a detail from you">{needsInput} Add it to the text, or rewrite the post.</Banner>}
      {post.error && status === "failed" && <Banner tone="critical" title="This post didn&apos;t go out">{post.error}</Banner>}

      <div className="wr-editor">
        <div className="wr-stack wr-editor-main">
          <section className="wr-card wr-compose">
            <label htmlFor="post-text" className="wr-compose-label">Post text</label>
            <textarea id="post-text" value={text} onChange={(event) => setText(event.target.value)} disabled={locked || rewriting} aria-describedby="post-count" />
            <div className="wr-compose-foot">
              <span className="wr-small wr-muted">{rewriting ? "Rewriting…" : changed ? "Unsaved changes" : "Saved"}</span>
              <span id="post-count" className="wr-mono" data-over={over || undefined}>{count.toLocaleString("en-US")} / 3,000</span>
            </div>
          </section>
          {!locked && (
            <>
              <form className="wr-rewrite" onSubmit={(event) => { event.preventDefault(); void rewrite(note); }}>
                <Icon name="sparkle" size={18} className="wr-brand-ink" />
                <input aria-label="How to rewrite it" placeholder="Rewrite it… e.g. shorter, open with the story" value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
                <button type="submit" disabled={rewriting}>{rewriting ? "Rewriting…" : "Rewrite"}</button>
              </form>
              <div className="wr-chips">
                {QUICK.map((label) => <button key={label} type="button" className="wr-quick" disabled={rewriting} onClick={() => void rewrite(label)}>{label}</button>)}
                <button type="button" className="wr-quick" onClick={() => { void navigator.clipboard?.writeText(text); toast.success("Copied.", { description: "Post it on LinkedIn, then mark it as posted by hand." }); }}><Icon name="copy" size={14} />Copy text</button>
                {!changed && status !== "skipped" && (
                  <button type="button" className="wr-quick" disabled={pending} onClick={() => run(() => markPostedByHand(post.id), "Marked as posted by hand. Poxeet won't send it.", () => setStatus("posted"))}>
                    <Icon name="check" size={14} />Mark as posted by hand
                  </button>
                )}
                {changed && !rewriting && <button type="button" className="wr-quick" onClick={() => setText(saved)}>Undo changes</button>}
              </div>
            </>
          )}
        </div>

        <div className="wr-stack wr-editor-side">
          <section className="wr-card wr-preview-card">
            <div className="wr-card-head wr-card-head-tight">
              <span className="wr-inline"><LinkedInLogo size={18} /><h2 className="wr-h2">Preview</h2></span>
              <div className="pxt-tabs" role="tablist" aria-label="Preview size">
                {(["desktop", "phone"] as const).map((id) => <button key={id} type="button" role="tab" className="pxt-tab" aria-selected={device === id} onClick={() => setDevice(id)}>{id === "desktop" ? "Desktop" : "Phone"}</button>)}
              </div>
            </div>
            <div className="wr-preview-frame" data-device={device}>
              <PostPreview author={author} when={`${WEEKDAYS[mondayIndex(day)]} ${post.time}`} text={text || "Your post appears here."} />
            </div>
          </section>
          <section className="wr-card wr-stack wr-notes" aria-labelledby="notes-h">
            <h2 id="notes-h" className="wr-h2">About this post</h2>
            <PostTags pillar={post.pillar} postType={post.postType} tone={tone} />
            <PostFlags flags={post.flags} />
            <PostWhy angle={post.angle} rationale={post.rationale} />
          </section>
        </div>
      </div>
    </div>
  );
}
