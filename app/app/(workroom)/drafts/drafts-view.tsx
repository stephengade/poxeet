"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { LinkedInLogo } from "../../../../components/brand/channel-logos";
import { firstLine, PageHead, shortDay } from "../../../../components/preview/parts";
import { Banner, Button, countCharacters, EmptyState, Icon } from "../../../../components/ui";
import { Reschedule } from "../../../../components/workroom/reschedule";
import { PostFlags, PostTags, PostWhy } from "../../../../components/workroom/post-notes";
import { toneIn } from "../../../../components/workroom/tones";
import { regeneratePost, setPostStatus } from "../posts/actions";

export type DraftPost = {
  id: string; date: string; time: string; text: string; pillar: string | null; postType: string | null;
  rationale: string | null; needsInput: string | null; flags: string[];
};

type Range = "all" | "week" | "later";

/** Step through drafts: approve, skip, rewrite or edit each one. Keyboard: A, S, E, J and K. */
export function DraftsView({ drafts: initial, weekEnd, timezone, themes }: { drafts: DraftPost[]; weekEnd: string; timezone: string; themes: string[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initial);
  const [range, setRange] = useState<Range>("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [, startTransition] = useTransition();

  const inRange = drafts.filter((post) => range === "all" || (range === "week" ? post.date <= weekEnd : post.date > weekEnd));
  const thisWeek = drafts.filter((post) => post.date <= weekEnd);
  const post = inRange.find((item) => item.id === pickedId) ?? inRange[0];
  const position = post ? inRange.indexOf(post) : -1;

  function decide(ids: string[], status: "approved" | "skipped") {
    const next = post && ids.includes(post.id) ? inRange[position + 1] ?? inRange[position - 1] : post;
    const removed = drafts.filter((item) => ids.includes(item.id));
    setDrafts((current) => current.filter((item) => !ids.includes(item.id)));
    setPickedId(next && !ids.includes(next.id) ? next.id : null);
    startTransition(async () => {
      const result = await setPostStatus(ids, status);
      if (!result.ok) {
        setDrafts((current) => [...current, ...removed].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
        return void toast.error(result.message);
      }
      toast.success(status === "approved"
        ? ids.length > 1 ? `${ids.length} drafts approved. They go out at their slots.` : "Approved. It goes out at its slot."
        : "Skipped. It won't be sent.", {
        action: { label: "Undo", onClick: () => { void setPostStatus(ids, "draft").then(() => { setDrafts((current) => [...current, ...removed].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))); router.refresh(); }); } },
      });
      router.refresh();
    });
  }

  async function rewrite() {
    if (!post) return;
    setRewriting(true);
    const result = await regeneratePost(post.id, "");
    setRewriting(false);
    if (!result.ok || !result.text) return void toast.error(result.ok ? "No new version came back." : result.message);
    setDrafts((current) => current.map((item) => (item.id === post.id ? { ...item, text: result.text!, needsInput: null } : item)));
    toast.success("Rewritten.", { description: "Open Edit to change it by hand." });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!post || rewriting || event.metaKey || event.ctrlKey || event.altKey || target?.closest("input, textarea, select, [contenteditable]")) return;
      const key = event.key.toLowerCase();
      if (key === "a") decide([post.id], "approved");
      else if (key === "s") decide([post.id], "skipped");
      else if (key === "e") router.push(`/app/posts/${post.id}`);
      else if (key === "j") setPickedId((inRange[position + 1] ?? post).id);
      else if (key === "k") setPickedId((inRange[position - 1] ?? post).id);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tabs: Array<[Range, string, number]> = [["all", "All", drafts.length], ["week", "This week", thisWeek.length], ["later", "Later", drafts.length - thisWeek.length]];

  return (
    <div className="wr-page">
      <PageHead
        title="Drafts"
        sub={drafts.length ? `${drafts.length} ${drafts.length === 1 ? "draft is" : "drafts are"} waiting. Approve, edit or skip each one; nothing goes out until you approve it.` : "Nothing waiting. New drafts arrive when you plan."}
        actions={drafts.length > 0 && (
          <>
            <div className="pxt-tabs" role="tablist" aria-label="Which drafts">
              {tabs.map(([id, label, count]) => <button key={id} type="button" role="tab" className="pxt-tab" aria-selected={range === id} onClick={() => { setRange(id); setPickedId(null); }}>{label} {count}</button>)}
            </div>
            {thisWeek.length > 0 && <Button variant="secondary" onClick={() => decide(thisWeek.map((item) => item.id), "approved")}>Approve this week</Button>}
          </>
        )}
      />

      {!post ? (
        <div className="wr-card">
          <EmptyState title={drafts.length ? "Nothing in this range" : "Every draft is reviewed"} icon="check-double" action={<Button href="/app/calendar">Open calendar</Button>}>
            Approved posts go out at their slots. Pause all in the top bar stops them at any time.
          </EmptyState>
        </div>
      ) : (
        <div className="wr-review">
          <ol className="wr-card wr-queue" aria-label="Draft queue">
            {inRange.map((item, index) => (
              <li key={item.id}>
                <button type="button" aria-current={item.id === post.id || undefined} data-tone={toneIn(themes, item.pillar)} onClick={() => setPickedId(item.id)}>
                  <span className="wr-mono">{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="wr-small wr-muted">{shortDay(item.date)} · {item.time}{item.pillar ? ` · ${item.pillar}` : ""}</span>
                    <strong>{firstLine(item.text)}</strong>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <section className="wr-card wr-focus" aria-label={`Draft ${position + 1} of ${inRange.length}`}>
            <div className="wr-focus-head">
              <span className="wr-inline">
                <span className="wr-mono">{position + 1} / {inRange.length}</span>
                <span className="wr-progress" aria-hidden="true"><span style={{ width: `${((position + 1) / inRange.length) * 100}%` }} /></span>
              </span>
              <span className="wr-inline wr-small wr-muted">
                <LinkedInLogo size={16} />
                <Reschedule key={post.id} postId={post.id} date={post.date} time={post.time} timezone={timezone}
                  onMoved={(date, time) => setDrafts((current) => current.map((item) => (item.id === post.id ? { ...item, date, time } : item))
                    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)))} />
              </span>
            </div>
            <div className="wr-focus-body">
              <PostTags pillar={post.pillar} postType={post.postType} tone={toneIn(themes, post.pillar)}>
                <span className="wr-type-pill wr-mono">{countCharacters(post.text).toLocaleString("en-US")} / 3,000</span>
              </PostTags>
              {post.needsInput && (
                <Banner tone="warning" title="Needs a detail from you">{post.needsInput} Edit the post to add it, or rewrite it.</Banner>
              )}
              <p className="wr-focus-text" aria-busy={rewriting || undefined}>{post.text}</p>
              <PostFlags flags={post.flags} />
              <PostWhy rationale={post.rationale} />
            </div>
            <div className="wr-focus-foot">
              <div className="wr-keys" aria-label="Keyboard shortcuts">
                <span><kbd className="wr-kbd">A</kbd> approve</span><span><kbd className="wr-kbd">E</kbd> edit</span><span><kbd className="wr-kbd">S</kbd> skip</span><span><kbd className="wr-kbd">J</kbd> <kbd className="wr-kbd">K</kbd> move</span>
              </div>
              <div className="wr-actions">
                <Button variant="ghost" onClick={() => decide([post.id], "skipped")} disabled={rewriting}>Skip</Button>
                <Button variant="secondary" icon={<Icon name="sparkle" size={15} className="wr-brand-ink" />} loading={rewriting} onClick={rewrite}>Rewrite</Button>
                <Button variant="secondary" href={`/app/posts/${post.id}`}>Edit</Button>
                <Button variant="brand" icon="check" onClick={() => decide([post.id], "approved")} disabled={rewriting}>Approve and next</Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
