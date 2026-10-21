"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { MONTHS, monthGrid, WEEKDAYS } from "../calendar/dates";
import { firstLine, longDay, shortDay } from "../preview/parts";
import { Icon } from "../ui";
import { pillarTones } from "./tones";
import type { PostStatus } from "../../lib/post-status";

export type BoardPost = { id: string; date: string; time: string; text: string; status: PostStatus; pillar?: string | null };

/** Posts that can still be moved: not sent, not being sent, not waiting for a check. */
const MOVABLE: PostStatus[] = ["draft", "approved", "skipped", "failed", "missed"];
const ATTENTION: PostStatus[] = ["failed", "needs_check", "missed"];
const MAX_CHIPS = 3;

/** The status filter in the calendar header; posts that don't match are dimmed. */
export type BoardFilter = "all" | "draft" | "approved" | "posted" | "attention";

export function matchesFilter(status: PostStatus, filter: BoardFilter) {
  if (filter === "all") return true;
  if (filter === "approved") return status === "approved" || status === "posting";
  if (filter === "attention") return ATTENTION.includes(status);
  return status === filter;
}

type Props = {
  month: string;
  today: string;
  posts: BoardPost[];
  selected: string | null;
  onSelect: (date: string) => void;
  /** Dropped on another day: move it there at the same time. */
  onMove: (post: BoardPost, date: string) => void;
  onApprove: (post: BoardPost) => void;
  /** The board's top line: the posting rhythm and time zone. */
  bar?: ReactNode;
  filter?: BoardFilter;
};

function Ring({ ready, total }: { ready: number; total: number }) {
  const label = `${ready} of ${total} ready`;
  if (total > 0 && ready === total) {
    return <svg width="24" height="24" viewBox="0 0 36 36" role="img" aria-label="Week ready"><circle cx="18" cy="18" r="15" className="wr-ring-done" /><path d="m12 18 4.5 4.5L24 14" className="wr-ring-check" /></svg>;
  }
  const dash = total ? (ready / total) * 94.25 : 0;
  return (
    <svg width="26" height="26" viewBox="0 0 36 36" role="img" aria-label={label}>
      <circle cx="18" cy="18" r="15" className="wr-ring-track" />
      {dash > 0 && <circle cx="18" cy="18" r="15" className="wr-ring-fill" strokeDasharray={`${dash} 94.25`} transform="rotate(-90 18 18)" />}
    </svg>
  );
}

/**
 * The month as a board: weeks start Monday, each day shows its posts as chips, and a chip can be dragged to
 * another day (from today on) to move it there at the same time. Clicking a chip shows its day in the panel beside
 * the board, which links to the editor. Draft chips have a one-click approve.
 * The week ring shows how many of the week's posts are approved or sent.
 */
export function MonthBoard({ month, today, posts, selected, onSelect, onMove, onApprove, bar, filter = "all" }: Props) {
  const [dragging, setDragging] = useState<BoardPost | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const days = monthGrid(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const [year, number] = month.split("-").map(Number);
  const postsOn = (date: string) => posts.filter((post) => post.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const { toneOf } = pillarTones(posts);

  function drop(event: DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const post = dragging;
    setDragging(null);
    setDropOn(null);
    if (post && post.date !== date) onMove(post, date);
  }

  return (
    <section className="wr-cal-card" aria-label={`${MONTHS[number - 1]} ${year}`}>
      {bar && <div className="wr-cal-bar">{bar}</div>}
      <div className="wr-board-themes">
        <span className="wr-small wr-muted wr-board-hint"><Icon name="info" size={13} />Drag a post to another day to move it</span>
      </div>
      <div className="wr-grid-scroll">
        <div className="wr-grid">
          <span className="wr-grid-corner" />
          {WEEKDAYS.map((day, index) => <span key={day} className="wr-grid-dow" data-weekend={index >= 5 || undefined}>{day}</span>)}
          {weeks.map((week) => {
            const weekPosts = week.flatMap((day) => postsOn(day.date)).filter((post) => post.status !== "skipped");
            const ready = weekPosts.filter((post) => ["approved", "posting", "posted"].includes(post.status)).length;
            return [
              <div key={`${week[0].date}-ring`} className="wr-grid-week" data-past={week[6].date < today || undefined}>
                {weekPosts.length > 0 && <Ring ready={ready} total={weekPosts.length} />}
              </div>,
              ...week.map((day) => {
                const items = postsOn(day.date);
                const past = day.date < today;
                const canDrop = Boolean(dragging) && !past && dragging?.date !== day.date;
                return (
                  <div
                    key={day.date}
                    className="wr-cell"
                    data-out={!day.inMonth || undefined}
                    data-past={past || undefined}
                    data-today={day.date === today || undefined}
                    data-selected={day.date === selected || undefined}
                    data-weekend={day.weekday >= 5 || undefined}
                    data-drop={dropOn === day.date || undefined}
                    onClick={() => onSelect(day.date)}
                    onDragOver={(event) => { if (canDrop) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropOn(day.date); } }}
                    onDragLeave={() => setDropOn((current) => (current === day.date ? null : current))}
                    onDrop={(event) => drop(event, day.date)}
                  >
                    <div className="wr-cell-top">
                      <button type="button" className="wr-cell-num" aria-pressed={day.date === selected}
                        aria-label={`${longDay(day.date)}, ${items.length === 1 ? "1 post" : `${items.length} posts`}`}
                        onClick={(event) => { event.stopPropagation(); onSelect(day.date); }}>{day.day}</button>
                      {items.some((post) => ATTENTION.includes(post.status)) && <span className="wr-cell-alert" role="img" aria-label="Needs attention" />}
                    </div>
                    {items.slice(0, MAX_CHIPS).map((post) => {
                      const movable = MOVABLE.includes(post.status);
                      return (
                        <div
                          key={post.id}
                          className="wr-chip wr-chip-tone"
                          data-status={post.status}
                          data-tone={toneOf(post.pillar)}
                          data-dragging={dragging?.id === post.id || undefined}
                          data-dim={!matchesFilter(post.status, filter) || undefined}
                          draggable={movable}
                          onDragStart={(event) => { setDragging(post); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", post.id); }}
                          onDragEnd={() => { setDragging(null); setDropOn(null); }}
                        >
                          <button type="button" className="wr-chip-main" onClick={(event) => { event.stopPropagation(); if (day.date !== selected) onSelect(day.date); }}
                            aria-label={`${post.time}, ${post.status.replace("_", " ")}: ${firstLine(post.text)}. Show ${longDay(day.date)}`}>
                            <span className="wr-chip-time">{post.status === "skipped" ? "Skip" : post.time}</span>
                            <span className="wr-chip-text">{firstLine(post.text)}</span>
                          </button>
                          {post.status === "draft" && (
                            <button type="button" className="wr-chip-approve" aria-label="Approve this draft" title="Approve"
                              onClick={(event) => { event.stopPropagation(); onApprove(post); }}><Icon name="check" size={12} strokeWidth={2.6} /></button>
                          )}
                        </div>
                      );
                    })}
                    {items.length > MAX_CHIPS && <span className="wr-more">+{items.length - MAX_CHIPS} more</span>}
                    {dropOn === day.date && dragging && <span className="wr-drop-hint">Drop to move to {shortDay(day.date)} at {dragging.time}</span>}
                  </div>
                );
              }),
            ];
          })}
        </div>
      </div>
    </section>
  );
}
