"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { CalendarList, CalendarRow } from "../../../../components/calendar/calendar-row";
import { longDay, SkyBand } from "../../../../components/preview/parts";
import { Banner, Button, EmptyState, Icon } from "../../../../components/ui";
import { JobProgress, type JobStep } from "../../../../components/workroom/job-progress";
import { matchesFilter, MonthBoard, type BoardFilter, type BoardPost } from "../../../../components/workroom/month-board";
import { pillarTones } from "../../../../components/workroom/tones";
import { MONTHS, mondayIndex, parseIsoDate, shiftMonth, WEEKDAYS } from "../../../../components/calendar/dates";
import type { Slot } from "../../../../lib/member";
import { POST_STATUS, type PostStatus } from "../../../../lib/post-status";
import { reschedulePost, setPostStatus } from "../posts/actions";
import { calendarProgress, resumePlan, startPlan, type CalendarProgress } from "./actions";

export type MemberPost = { id: string; date: string; time: string; text: string; status: PostStatus; pillar: string | null; postType: string | null };

type Props = {
  today: string;
  posts: MemberPost[];
  progress: CalendarProgress | null;
  hasVoice: boolean;
  slots: Slot[];
  timezone: string;
  defaultStart: string;
  openPlan: boolean;
  linkedinConnected: boolean;
};

const POLL_MS = 4_000;
const DAY_NAMES: Record<Slot["day"], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const running = (progress: CalendarProgress | null) => Boolean(progress && !progress.stale && (progress.status === "planning" || progress.status === "drafting"));

/** Keeps asking how the plan is going while it runs; refreshes the page as weeks land. */
function useProgress(initial: CalendarProgress | null) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  useEffect(() => {
    if (!running(progress)) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const next = await calendarProgress();
      if (stopped || !next) return;
      const moved = next.drafted !== progress?.drafted || next.status !== progress?.status;
      setProgress(next);
      if (moved) router.refresh();
      if (next.status === "ready") toast.success("Your month is drafted.", { description: "Review the drafts: nothing goes out until you approve it." });
      if (next.status === "failed") toast.error("Planning stopped.", { description: next.message ?? undefined });
    }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [progress, router]);
  return [progress, setProgress] as const;
}

export function CalendarView({ today, posts: serverPosts, progress: initial, hasVoice, slots, timezone, defaultStart, openPlan, linkedinConnected }: Props) {
  const [progress, setProgress] = useProgress(initial);
  const [planOpen, setPlanOpen] = useState(openPlan && hasVoice);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "list">("month");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [resuming, resume] = useTransition();
  const router = useRouter();
  // Moves and approvals show at once; the server's answer replaces them on refresh.
  const [local, setLocal] = useState<Record<string, Partial<MemberPost>>>({});
  const posts = useMemo(() => serverPosts.map((post) => ({ ...post, ...local[post.id] })), [serverPosts, local]);
  const [month, setMonth] = useState(() => (serverPosts.find((post) => post.date >= today)?.date ?? today).slice(0, 7));
  const busy = running(progress);
  const { toneOf } = pillarTones(posts);
  const upcoming = useMemo(() => posts.filter((post) => post.date >= today), [posts, today]);
  const drafts = posts.filter((post) => post.status === "draft").length;
  const waiting = posts.filter((post) => post.status === "approved").length;
  // The day panel shows the selected day, or today until a day is picked.
  const dayPosts = posts.filter((post) => post.date === (selected ?? today)).sort((a, b) => a.time.localeCompare(b.time));

  function move(post: BoardPost, date: string) {
    setLocal((current) => ({ ...current, [post.id]: { ...current[post.id], date } }));
    resume(async () => {
      const result = await reschedulePost(post.id, { date, time: post.time });
      if (!result.ok) {
        setLocal((current) => ({ ...current, [post.id]: { ...current[post.id], date: post.date } }));
        const passed = date === today && result.message.includes("future");
        return void toast.error(passed ? `${post.time} has already passed today.` : result.message, {
          description: passed ? "Open the post and pick a later time." : undefined,
          ...(passed ? { action: { label: "Open post", onClick: () => router.push(`/app/posts/${post.id}`) } } : {}),
        });
      }
      toast.success(`Moved to ${longDay(date)} at ${post.time}.`, {
        action: { label: "Undo", onClick: () => { void reschedulePost(post.id, { date: post.date, time: post.time }).then(() => { setLocal((current) => ({ ...current, [post.id]: { ...current[post.id], date: post.date } })); router.refresh(); }); } },
      });
      router.refresh();
    });
  }

  function approve(post: BoardPost) {
    setLocal((current) => ({ ...current, [post.id]: { ...current[post.id], status: "approved" } }));
    resume(async () => {
      const result = await setPostStatus([post.id], "approved");
      if (!result.ok) {
        setLocal((current) => ({ ...current, [post.id]: { ...current[post.id], status: post.status } }));
        return void toast.error(result.message);
      }
      toast.success("Approved. It goes out at its slot.");
      router.refresh();
    });
  }

  function retry() {
    if (!progress) return;
    resume(async () => {
      const result = await resumePlan(progress.id);
      if (!result.ok) return void toast.error(result.message);
      setProgress({ ...progress, status: "drafting", stale: false, reason: null, message: null });
    });
  }

  const planButton = hasVoice
    ? <Button icon="sparkle" onClick={() => setPlanOpen(true)} disabled={busy}>{posts.length ? "Plan more weeks" : "Plan a month"}</Button>
    : <Button href="/app/voice">Analyse your voice first</Button>;
  const [year, monthNumber] = month.split("-").map(Number);
  const inMonth = posts.filter((post) => post.date.startsWith(month));
  const pills: Array<[BoardFilter, string, number]> = [
    ["all", "All", inMonth.length],
    ["draft", inMonth.filter((post) => post.status === "draft").length === 1 ? "draft" : "drafts", inMonth.filter((post) => post.status === "draft").length],
    ["approved", "approved", inMonth.filter((post) => matchesFilter(post.status, "approved")).length],
    ["posted", "posted", inMonth.filter((post) => post.status === "posted").length],
    ["attention", "need a check", inMonth.filter((post) => matchesFilter(post.status, "attention")).length],
  ];
  const rhythm = slots.length ? `${[...new Set(slots.map((slot) => DAY_NAMES[slot.day]))].join(", ")} at ${slots[0].time}` : "No posting days set";

  return (
    <div className="wr-page wr-page-wide">
      <SkyBand className="wr-cal-sky wr-cal-head">
        <div>
          <div className="wr-inline wr-cal-nav">
            <button type="button" className="wr-glass-icon" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevron-left" size={14} strokeWidth={2} /></button>
            <button type="button" className="wr-glass-icon" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron-right" size={14} strokeWidth={2} /></button>
            <button type="button" className="wr-glass-btn" onClick={() => { setMonth(today.slice(0, 7)); setSelected(null); }}>Today</button>
          </div>
          <h1 className="wr-cal-title">{MONTHS[monthNumber - 1]} <span>{year}</span></h1>
          {view === "month" && inMonth.length > 0 && (
            <div className="wr-pills" role="group" aria-label="Filter by status">
              {pills.filter(([id, , value]) => id === "all" || value > 0).map(([id, label, value]) => (
                <button key={id} type="button" className="wr-pill" data-kind={id} aria-pressed={filter === id} onClick={() => setFilter(filter === id && id !== "all" ? "all" : id)}>
                  {id !== "all" && <span className="wr-pill-dot" aria-hidden="true" />}
                  {id === "all" ? `All ${value}` : `${value} ${label}`}
                  {filter === id && id !== "all" && <Icon name="x" size={10} strokeWidth={3} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="wr-inline wr-cal-tools">
          {posts.length > 0 && <ViewTabs view={view} onChange={setView} />}
          {drafts > 0 && <Button variant="secondary" href="/app/drafts">Review drafts</Button>}
          {planButton}
        </div>
      </SkyBand>

      {!linkedinConnected && waiting > 0 && (
        <Banner tone="warning" title="LinkedIn isn't connected" action={<Button size="sm" href="/app/settings/channels">Reconnect</Button>}>
          {waiting} approved {waiting === 1 ? "post" : "posts"} can&apos;t go out until you reconnect. You can still copy a post and publish it by hand.
        </Banner>
      )}
      {busy && progress && <ProgressBanner progress={progress} />}
      {progress?.status === "failed" && (
        <Banner tone="critical" title="Planning stopped" action={
          progress.reason === "no_credits" ? <Button size="sm" href="/app/settings/credits?buy=1">Buy credits</Button>
            : progress.reason === "no_access" || progress.reason === "cap_reached" ? <Button size="sm" href="/app/settings/ai">AI access</Button>
              : <Button size="sm" onClick={retry} loading={resuming}>Try again</Button>
        }>
          {progress.message ?? "Something went wrong."} {progress.drafted > 0 ? `The ${progress.drafted} drafts already written are kept.` : ""}
        </Banner>
      )}
      {progress?.stale && (
        <Banner tone="warning" title="Planning didn't finish" action={<Button size="sm" onClick={retry} loading={resuming}>Continue</Button>}>
          It stopped part-way. Continue to write the remaining weeks; finished weeks are kept.
        </Banner>
      )}

      {posts.length === 0 && !busy ? (
        <div className="wr-card">
          <EmptyState title={hasVoice ? "Plan your first month" : "Your voice comes first"} icon="calendar" action={planButton}>
            {hasVoice
              ? "Poxeet plans posts on your posting days, then drafts them in your voice a week at a time. You review each one; nothing goes out until you approve it."
              : "Drafts are written in your voice, so analyse it before planning. It takes about a minute."}
          </EmptyState>
        </div>
      ) : (
        <div className="wr-cal-layout" data-panel={view === "month" || undefined}>
          {view === "month" ? (
            <MonthBoard
              month={month}
              today={today}
              posts={posts}
              selected={selected}
              onSelect={(date) => setSelected(date === selected ? null : date)}
              onMove={move}
              onApprove={approve}
              filter={filter}
              bar={<>
                <span className="wr-inline"><Icon name="pulse" size={15} className="wr-brand-ink" />Your rhythm: <strong>{rhythm}</strong><Link href="/app/settings/schedule" className="wr-link">Change</Link></span>
                <span className="wr-muted">{filter === "all" ? `Times in ${timezone.replaceAll("_", " ")}` : <>Filtered · <button type="button" className="wr-text-btn" onClick={() => setFilter("all")}>Clear filter</button></>}</span>
              </>}
            />
          ) : (
            <section className="wr-card wr-stack">
              <h2 className="wr-h2">Upcoming</h2>
              {upcoming.length ? (
                <CalendarList>
                  {upcoming.map((post) => <PostRow key={post.id} post={post} />)}
                </CalendarList>
              ) : <p className="wr-small wr-muted">Nothing scheduled from today.</p>}
            </section>
          )}
          {view === "month" && <WeekStrip date={selected ?? today} today={today} posts={posts} toneOf={toneOf} onSelect={setSelected} />}
          {view === "month" && <DayPanel date={selected ?? today} today={today} posts={dayPosts} toneOf={toneOf} onApprove={approve} />}
          {view === "month" && <ComingUp after={selected ?? today} posts={posts} toneOf={toneOf} />}
        </div>
      )}

      {planOpen && <PlanSheet slots={slots} timezone={timezone} defaultStart={defaultStart} onClose={() => setPlanOpen(false)}
        onStarted={(started) => { setPlanOpen(false); setProgress(started); }} />}
    </div>
  );
}

function ViewTabs({ view, onChange }: { view: "month" | "list"; onChange: (view: "month" | "list") => void }) {
  return (
    <div className="wr-glass-tabs" role="tablist" aria-label="Calendar view">
      {(["month", "list"] as const).map((item) => (
        <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => onChange(item)}>{item === "month" ? "Month" : "List"}</button>
      ))}
    </div>
  );
}

function PostRow({ post }: { post: MemberPost }) {
  const router = useRouter();
  return <CalendarRow date={post.date} time={post.time} text={post.text} status={post.status} pillar={post.pillar ?? undefined} postType={post.postType ?? undefined}
    onClick={() => router.push(`/app/posts/${post.id}`)} />;
}

/** The raised panel beside the board: the day's date set large, then each post as a bold card in its pillar's colour. */
type ToneOf = (pillar?: string | null) => number | undefined;

function addDays(date: string, days: number) {
  const value = parseIsoDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Phones: the week around the shown day, each day with a colour bar per post. Tapping a day shows it below. */
function WeekStrip({ date, today, posts, toneOf, onSelect }: { date: string; today: string; posts: MemberPost[]; toneOf: ToneOf; onSelect: (date: string) => void }) {
  const monday = addDays(date, -mondayIndex(parseIsoDate(date)));
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const shown = parseIsoDate(date);
  return (
    <section className="wr-cal-phone" aria-label="Week">
      <div className="wr-cal-phone-head">
        <h2 className="wr-cal-phone-month">{MONTHS[shown.getUTCMonth()]} <span>{shown.getUTCFullYear()}</span></h2>
        <span className="wr-inline">
          <button type="button" className="wr-glass-icon" aria-label="Previous week" onClick={() => onSelect(addDays(date, -7))}><Icon name="chevron-left" size={16} /></button>
          <button type="button" className="wr-glass-icon" aria-label="Next week" onClick={() => onSelect(addDays(date, 7))}><Icon name="chevron-right" size={16} /></button>
        </span>
      </div>
      <div className="wr-strip" role="tablist" aria-label="Days">
        {days.map((day) => {
          const items = posts.filter((post) => post.date === day);
          return (
            <button key={day} type="button" role="tab" className="wr-strip-day" aria-selected={day === date} data-today={day === today || undefined}
              aria-label={`${longDay(day)}, ${items.length === 1 ? "1 post" : `${items.length} posts`}`} onClick={() => onSelect(day)}>
              {WEEKDAYS[mondayIndex(parseIsoDate(day))]}
              <strong>{parseIsoDate(day).getUTCDate()}</strong>
              <span className="wr-strip-bars" aria-hidden="true">
                {items.slice(0, 3).map((post) => <span key={post.id} data-status={post.status} data-tone={toneOf(post.pillar)} />)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Phones: the next few posts after the shown day. */
function ComingUp({ after, posts, toneOf }: { after: string; posts: MemberPost[]; toneOf: ToneOf }) {
  const next = posts.filter((post) => post.date > after && post.status !== "skipped").slice(0, 4);
  if (!next.length) return null;
  return (
    <section className="wr-coming" aria-label="Coming up">
      <h2 className="wr-h2">Coming up</h2>
      {next.map((post) => (
        <Link key={post.id} href={`/app/posts/${post.id}`} className="wr-coming-item" data-status={post.status} data-tone={toneOf(post.pillar)}>
          <span className="wr-coming-bar" aria-hidden="true" />
          <span className="wr-coming-text">
            <span className="wr-small wr-muted">{WEEKDAYS[mondayIndex(parseIsoDate(post.date))]} {parseIsoDate(post.date).getUTCDate()} · <span className="wr-mono">{post.time}</span> · {POST_STATUS[post.status].label}</span>
            <strong>{post.text.split("\n")[0]}</strong>
          </span>
        </Link>
      ))}
    </section>
  );
}

function DayPanel({ date, today, posts, toneOf, onApprove }: { date: string; today: string; posts: MemberPost[]; toneOf: ToneOf; onApprove: (post: BoardPost) => void }) {
  const day = parseIsoDate(date);
  const approved = posts.filter((post) => ["approved", "posting", "posted"].includes(post.status)).length;
  const drafts = posts.filter((post) => post.status === "draft").length;
  const summary = posts.length
    ? [approved && `${approved} ready`, drafts && `${drafts} ${drafts === 1 ? "draft" : "drafts"}`].filter(Boolean).join(", ") || `${posts.length} ${posts.length === 1 ? "post" : "posts"}`
    : "Nothing planned";
  return (
    <aside className="wr-day-panel" aria-label={longDay(date)}>
      <div className="wr-day-top">
        <span className="wr-day-kicker">{date === today ? `Today · ${WEEKDAYS[mondayIndex(day)]}` : WEEKDAYS[mondayIndex(day)]}</span>
        <span className="wr-day-num">{day.getUTCDate()}</span>
        <span className="wr-small">{MONTHS[day.getUTCMonth()]} · {summary}</span>
      </div>
      {posts.length ? (
        <div className="wr-day-list">
          {posts.map((post) => (
            <article key={post.id} className="wr-day-card" data-status={post.status} data-tone={toneOf(post.pillar)}>
              <Link href={`/app/posts/${post.id}`} className="wr-day-card-link">
                <span className="wr-day-card-meta">
                  <span className="wr-mono">{post.time}</span>
                  {post.pillar && <span>{post.pillar}</span>}
                  <span className="wr-day-card-status">{POST_STATUS[post.status].label}</span>
                </span>
                <span className="wr-day-card-text">{post.text.replace(/\s+/g, " ")}</span>
                {post.postType && <span className="wr-day-card-pillar">{post.postType}</span>}
              </Link>
              {post.status === "draft" && (
                <span className="wr-day-card-actions">
                  <button type="button" className="wr-day-card-approve" onClick={() => onApprove(post)}><Icon name="check" size={14} strokeWidth={2.4} />Approve</button>
                  <Link href={`/app/posts/${post.id}`} className="wr-day-card-edit">Edit</Link>
                </span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="wr-day-empty"><strong>No posts on this day</strong>Pick another day on the board, or plan more weeks.</div>
      )}
    </aside>
  );
}

function ProgressBanner({ progress }: { progress: CalendarProgress }) {
  const planning = progress.status === "planning";
  const steps: JobStep[] = [
    { label: "Plan the posts", state: planning ? "active" : "done" },
    ...Array.from({ length: progress.weeksTotal }, (_, week): JobStep => ({
      label: `Week ${week + 1}`,
      state: planning ? "todo" : week < progress.weeksDone ? "done" : week === progress.weeksDone ? "active" : "todo",
    })),
  ];
  const percent = progress.planned ? Math.round(((planning ? 0 : 0.08) + (progress.drafted / progress.planned) * 0.92) * 100) : null;
  return (
    <JobProgress
      title={planning ? "Planning your posts" : `Drafting week ${Math.min(progress.weeksDone + 1, progress.weeksTotal)} of ${progress.weeksTotal}`}
      detail={planning
        ? "Choosing themes and a fresh angle for each slot from your voice and brief."
        : `${progress.drafted} of ${progress.planned} posts written in your voice. Each week lands on the calendar as it's done.`}
      percent={planning ? null : percent}
      steps={steps}
      recent={progress.recent}
      startedAt={progress.startedAt}
    />
  );
}

/** Start date, how many weeks, and the rhythm it uses; the dates come from the publishing schedule. */
function PlanSheet({ slots, timezone, defaultStart, onClose, onStarted }: {
  slots: Slot[]; timezone: string; defaultStart: string; onClose: () => void; onStarted: (progress: CalendarProgress) => void;
}) {
  const id = useId();
  const [startDate, setStartDate] = useState(defaultStart);
  const [weeks, setWeeks] = useState(4);
  const [fix, setFix] = useState<{ message: string; label?: string; href?: string } | null>(null);
  const [pending, start] = useTransition();
  const days = [...new Set(slots.map((slot) => slot.day))];
  const times = [...new Set(slots.map((slot) => slot.time))];
  const posts = slots.length * weeks;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    setFix(null);
    start(async () => {
      const result = await startPlan({ startDate, weeks });
      if (!result.ok) return void setFix({ message: result.message, label: result.fix?.label, href: result.fix?.href });
      toast.success("Planning started.", { description: "Drafts arrive a week at a time. You can leave this page." });
      onStarted({ id: result.calendarId, status: "planning", weeksDone: 0, weeksTotal: weeks, drafted: 0, planned: posts, reason: null, message: null, stale: false, startedAt: new Date().toISOString(), recent: [] });
    });
  }

  return createPortal(
    <div className="wr-sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="wr-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="wr-sheet-head">
          <div>
            <h2 id={`${id}-title`} className="wr-h2">Plan your posts</h2>
            <p className="wr-small wr-muted">Poxeet plans each slot, then drafts it in your voice. You review everything before it goes out.</p>
          </div>
          <button type="button" className="wr-icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="wr-sheet-body">
          {fix && (
            <Banner tone="warning" title="Can't plan yet" action={fix.href ? <Button size="sm" href={fix.href}>{fix.label}</Button> : undefined}>{fix.message}</Banner>
          )}
          <label className="wr-field">Start on
            <input type="date" value={startDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setStartDate(event.target.value)} required />
          </label>
          <div className="wr-field">
            <span id={`${id}-weeks`}>How many weeks</span>
            <div className="wr-radio-pills" role="radiogroup" aria-labelledby={`${id}-weeks`}>
              {[1, 2, 4, 6, 8].map((value) => (
                <button key={value} type="button" role="radio" aria-checked={weeks === value} onClick={() => setWeeks(value)}><span aria-hidden="true" />{value === 1 ? "1 week" : `${value} weeks`}</button>
              ))}
            </div>
          </div>
          <ul className="wr-buy-facts">
            <li><Icon name="calendar" size={16} /><span>{days.map((day) => DAY_NAMES[day]).join(", ")} at {times.join(", ")} ({timezone}). <Link href="/app/settings/schedule" className="wr-link">Change</Link></span></li>
            <li><Icon name="pencil" size={16} /><span>About {posts} posts, drafted a week at a time. Each draft is one AI call.</span></li>
            <li><Icon name="check" size={16} /><span>Nothing is posted until you approve it.</span></li>
          </ul>
          <p className="wr-small wr-muted">Plans use your <Link href="/app/voice" className="wr-link">voice</Link> and <Link href="/app/brief" className="wr-link">brief</Link>. A fuller brief gives sharper angles.</p>
        </div>
        <div className="wr-sheet-foot">
          <span className="wr-small wr-muted">{posts} posts · {weeks} {weeks === 1 ? "week" : "weeks"}</span>
          <Button type="submit" loading={pending} icon="sparkle">{pending ? "Starting" : "Plan and draft"}</Button>
        </div>
      </form>
    </div>,
    document.querySelector(".wr-shell") ?? document.body,
  );
}
