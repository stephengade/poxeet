import Link from "next/link";
import { MONTHS, mondayIndex, parseIsoDate, WEEKDAYS, WEEKDAYS_LONG } from "../../../components/calendar/dates";
import { firstLine, PageHead, StatusTag } from "../../../components/preview/parts";
import { SetupList } from "../../../components/workroom/setup-list";
import { pillarTones } from "../../../components/workroom/tones";
import { Button, EmptyState, Icon } from "../../../components/ui";
import { LinkedInLogo } from "../../../components/brand/channel-logos";
import { PostDecision } from "./home-actions";
import type { Slot } from "../../../lib/member";
import type { PostStatus } from "../../../lib/post-status";

const DAY: Record<Slot["day"], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const READY: PostStatus[] = ["approved", "posting"];

function rhythmText(slots: Slot[]) {
  if (!slots.length) return "No posting days set yet.";
  return `${slots.map((slot) => DAY[slot.day]).join(", ")} at ${slots[0].time}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const shortDate = (date: string) => { const day = parseIsoDate(date); return `${WEEKDAYS[mondayIndex(day)]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()].slice(0, 3)}`; };
const longDate = (date: string) => { const day = parseIsoDate(date); return `${WEEKDAYS_LONG[mondayIndex(day)]}, ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`; };
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export type HomePost = { id: string; date: string; time: string; text: string; status: PostStatus; pillar: string | null; postType: string | null };
type Step = Parameters<typeof SetupList>[0]["steps"][number];

export type HomeProps = {
  firstName: string | null; today: string; steps: readonly Step[]; done: number; total: number; posts: HomePost[]; drafts: number;
  slots: Slot[]; timezone: string; credits: { balance: number; weeks: number } | null;
  /** The active voice profile, in brief. */
  voice: { version: number; summary: string; words: string[] } | null;
  author: { name: string; initials: string };
};

const ATTENTION: PostStatus[] = ["needs_check", "failed", "missed"];
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Home: the opening card, four numbers, the next 7 days as colour blocks, the review queue, what goes out next,
 * posts that need a check, and the voice in brief.
 */
export function HomeView({ firstName, today, steps, done, total, posts, drafts: memberDrafts, slots, timezone, credits, voice, author }: HomeProps) {
  const ready = done === total;
  const { toneOf } = pillarTones(posts);
  const upcoming = posts.filter((post) => post.date >= today);
  const drafts = upcoming.filter((post) => post.status === "draft");
  const approved = upcoming.filter((post) => READY.includes(post.status));
  const posted = posts.filter((post) => post.status === "posted" && post.date.slice(0, 7) === today.slice(0, 7));
  const next = approved[0];
  // Posts from the last two weeks that didn't go out cleanly, newest first (shown as notices).
  const attention = posts.filter((post) => ATTENTION.includes(post.status) && post.date >= addDays(today, -14)).reverse().slice(0, 3);
  const week = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const draftCount = Math.max(memberDrafts, drafts.length);
  const sub = !ready
    ? `${done} of ${total} setup steps done. Finish them and your calendar is ready to plan.`
    : draftCount
      ? `${plural(draftCount, "draft is", "drafts are")} ready for review. Approve them and they go out on their days.`
      : approved.length ? `${plural(approved.length, "post is", "posts are")} approved and scheduled. Nothing else needs you.` : "You're set up. Plan your first month whenever you're ready.";
  const action = !ready
    ? <Button href="/app/setup" iconRight="arrow-right">Continue setup</Button>
    : draftCount ? <Button href="/app/drafts" iconRight="arrow-right">Review drafts</Button>
      : <Button href="/app/calendar?plan=1" icon="sparkle">{posts.length ? "Plan more weeks" : "Plan a month"}</Button>;

  return (
    <div className="wr-page">
      <section className="wr-band wr-home-band">
        <p className="wr-sky-kicker">{longDate(today)}</p>
        <PageHead title={firstName ? `Welcome, ${firstName}` : "Welcome"} sub={sub} actions={action} />
      </section>

      {ready && (
        <div className="wr-stats">
          <Link href="/app/drafts" className="wr-stat">
            <span className="wr-stat-label">Waiting for review<span className="wr-stat-icon" data-tone="warning"><Icon name="pencil" size={17} /></span></span>
            <span className="wr-stat-value">{draftCount}<small>{draftCount === 1 ? "draft" : "drafts"}</small></span>
            <span className="wr-stat-foot">{drafts[0] ? <>Next one <b>{shortDate(drafts[0].date)}</b></> : "All caught up"}</span>
          </Link>
          <Link href="/app/calendar" className="wr-stat">
            <span className="wr-stat-label">Approved<span className="wr-stat-icon" data-tone="brand"><Icon name="check" size={17} /></span></span>
            <span className="wr-stat-value">{approved.length}<small>{approved.length === 1 ? "post" : "posts"}</small></span>
            <span className="wr-stat-foot">{approved.length ? <>Through <b>{shortDate(approved[approved.length - 1].date)}</b></> : "Approve drafts to schedule them"}</span>
          </Link>
          <Link href="/app/history" className="wr-stat">
            <span className="wr-stat-label">Posted in {MONTHS[parseIsoDate(today).getUTCMonth()]}<span className="wr-stat-icon" data-tone="success"><Icon name="send" size={17} /></span></span>
            <span className="wr-stat-value">{posted.length}<small>{posted.length === 1 ? "post" : "posts"}</small></span>
            <span className="wr-stat-foot">Rhythm: <b>{rhythmText(slots)}</b></span>
          </Link>
          {credits ? (
            <Link href="/app/settings/credits" className="wr-stat">
              <span className="wr-stat-label">Credits<span className="wr-stat-icon" data-tone="violet"><Icon name="card" size={17} /></span></span>
              <span className="wr-stat-value">{credits.balance.toLocaleString("en-US")}<small>left</small></span>
              <span className="wr-stat-foot">{credits.weeks > 0 ? <>About <b>{plural(credits.weeks, "week", "weeks")}</b> of drafts</> : <b data-tone="warning">Less than a week of drafts</b>}</span>
            </Link>
          ) : (
            <Link href="/app/settings/schedule" className="wr-stat">
              <span className="wr-stat-label">Posting days<span className="wr-stat-icon" data-tone="violet"><Icon name="calendar" size={17} /></span></span>
              <span className="wr-stat-value">{slots.length}<small>a week</small></span>
              <span className="wr-stat-foot">{timezone.replaceAll("_", " ")}</span>
            </Link>
          )}
        </div>
      )}

      <div className="wr-split">
        {!ready && (
          <div className="wr-split-side">
            <div className="wr-card wr-stack">
              <div className="wr-card-head">
                <div><h2 className="wr-h2">Get set up</h2><p className="wr-sub wr-small">These steps stay here until they&apos;re done.</p></div>
                <span className="wr-setup-meter" role="img" aria-label={`${done} of ${total} steps done`}>
                  {steps.map((step) => <span key={step.id} data-done={step.done || undefined} />)}
                </span>
              </div>
            </div>
            <SetupList steps={steps} />
          </div>
        )}

        <div className="wr-split-main wr-stack">
          {ready && upcoming.length > 0 ? (
            <section className="wr-home-week" aria-label="The next 7 days">
              <div className="wr-home-week-head">
                <h2 className="wr-h2">The next 7 days</h2>
                <Link href="/app/calendar" className="wr-link">Open calendar<Icon name="arrow-right" size={14} /></Link>
              </div>
              <div className="wr-week-scroll">
                <div className="wr-week">
                  {week.map((date) => {
                    const items = posts.filter((post) => post.date === date);
                    const day = parseIsoDate(date);
                    return (
                      <div key={date} className="wr-week-day" data-today={date === today || undefined} data-empty={items.length ? undefined : true}>
                        <span className="wr-week-head"><strong>{WEEKDAYS[mondayIndex(day)]}</strong>{date === today ? <span className="wr-week-num">{day.getUTCDate()}</span> : <span>{day.getUTCDate()}</span>}</span>
                        {items.length ? items.map((post) => (
                          <Link key={post.id} href={`/app/posts/${post.id}`} className="wr-tile" data-status={post.status} data-tone={toneOf(post.pillar)}>
                            <span className="wr-tile-meta">{post.time}{post.status === "draft" ? " · Draft" : ""}</span>
                            <span className="wr-tile-text">{firstLine(post.text)}</span>
                          </Link>
                        )) : <span className="wr-week-rest">Rest</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
          {ready && drafts.length > 0 && (
            <section className="wr-card wr-card-flush" aria-labelledby="queue-h">
              <div className="wr-card-head">
                <div><h2 id="queue-h" className="wr-h2">Review queue</h2><p className="wr-card-sub">Soonest first. Nothing goes out until you approve it.</p></div>
                <Link href="/app/drafts" className="wr-link">Review one by one</Link>
              </div>
              <div className="wr-table-wrap">
                <table className="wr-table wr-queue-table">
                  <thead><tr><th>Post</th><th>Scheduled</th><th>Format</th><th><span className="pxt-sr">Actions</span></th></tr></thead>
                  <tbody>
                    {drafts.slice(0, 5).map((post) => (
                      <tr key={post.id} data-tone={toneOf(post.pillar)}>
                        <td className="wr-td-main"><Link href={`/app/posts/${post.id}`}>{firstLine(post.text)}</Link>{post.pillar && <span className="wr-queue-pillar">{post.pillar}</span>}</td>
                        <td><span className="wr-nowrap">{shortDate(post.date)}</span><span className="wr-mono wr-muted">{post.time}</span></td>
                        <td>{post.postType && <span className="wr-chip-grey">{sentence(post.postType)}</span>}</td>
                        <td className="wr-td-actions"><PostDecision id={post.id} decision="approve" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {!(ready && (upcoming.length > 0 || drafts.length > 0)) && (
            <EmptyState title="No posts planned yet" icon="calendar" action={ready ? <Button size="sm" href="/app/calendar?plan=1" icon="sparkle">Plan a month</Button> : undefined}>
              Poxeet plans your posting days, then drafts each post in your voice, a week at a time. Nothing goes out until you approve it.
            </EmptyState>
          )}
        </div>

        {ready && (
          <div className="wr-split-side">
            <section className="wr-card wr-stack" aria-labelledby="next-h">
              <div className="wr-card-head wr-card-head-tight">
                <h2 id="next-h" className="wr-h2">Up next</h2>
                {next && <span className="wr-mono wr-muted">{next.date === today ? `Today ${next.time}` : `${shortDate(next.date)} ${next.time}`}</span>}
              </div>
              {next ? (
                <>
                  <div className="wr-mini-post" data-tone={toneOf(next.pillar)}>
                    <span className="wr-mini-author">
                      <span className="wr-mini-avatar" aria-hidden="true">{author.initials}</span>
                      <span><strong>{author.name}</strong><span>{next.pillar ?? "LinkedIn"}</span></span>
                      <LinkedInLogo size={16} />
                    </span>
                    <p>{next.text.replace(/\s*\n+\s*/g, " ")}</p>
                  </div>
                  <div className="wr-actions"><Button size="sm" variant="secondary" href={`/app/posts/${next.id}`}>Edit</Button><PostDecision id={next.id} decision="stop" /></div>
                </>
              ) : drafts[0] ? (
                <div className="wr-stack">
                  <p className="wr-small wr-muted" style={{ margin: 0 }}>Nothing is approved yet. The next draft is for {shortDate(drafts[0].date)}.</p>
                  <span><StatusTag status="draft" /></span>
                </div>
              ) : <p className="wr-small wr-muted" style={{ margin: 0 }}>Nothing scheduled yet.</p>}
            </section>
            {attention.map((post) => (
              <Link key={post.id} href={`/app/posts/${post.id}`} className="wr-card wr-notice" data-tone="warning">
                <Icon name="clock" size={16} />
                <span>
                  <strong>{shortDate(post.date)}&apos;s post {post.status === "needs_check" ? "needs a check" : post.status === "failed" ? "didn't go out" : "missed its slot"}</strong>
                  <span>{post.status === "needs_check" ? <>LinkedIn didn&apos;t confirm &ldquo;{firstLine(post.text)}&rdquo; went out.</> : <>&ldquo;{firstLine(post.text)}&rdquo; wasn&apos;t sent. Open it to fix or move it.</>}</span>
                </span>
              </Link>
            ))}
            {voice && (
              <section className="wr-card wr-stack" aria-labelledby="voice-h">
                <div className="wr-card-head wr-card-head-tight"><h2 id="voice-h" className="wr-h2">Your voice</h2><span className="wr-mono wr-muted">v{voice.version}</span></div>
                <p className="wr-quote">{voice.summary}</p>
                {voice.words.length > 0 && <div className="wr-chips">{voice.words.slice(0, 4).map((word, index) => <span key={word} className="wr-voice-chip" data-tone={index % 6}>{sentence(word)}</span>)}</div>}
                <Link href="/app/voice" className="wr-link">Open voice profile</Link>
              </section>
            )}
            <div className="wr-card wr-stack">
              <div className="wr-card-head wr-card-head-tight">
                <div>
                  <h2 className="wr-h2">Your posting rhythm</h2>
                  <p className="wr-sub wr-small">{rhythmText(slots)} · {timezone.replaceAll("_", " ")}</p>
                </div>
                <Link href="/app/settings/schedule" className="wr-link"><Icon name="pencil" size={14} /> Change</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
