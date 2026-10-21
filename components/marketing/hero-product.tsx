import { POST_STATUS, type PostStatus } from "../../lib/post-status";
import { Logo } from "../brand/logo";
import { monthGrid, WEEKDAYS } from "../calendar/dates";
import { Icon } from "../ui/icon";
import { SAMPLE_AUTHOR, SAMPLE_MONTH, SAMPLE_POSTS, SAMPLE_TODAY } from "./sample-calendar";

const LEGEND: PostStatus[] = ["posted", "approved", "draft", "needs_check", "skipped"];
const NAV = ["Calendar", "Voice", "History", "Settings"];

/** The hero product shot: the signed-in calendar with sample posts. A static picture, so it is inert. */
export function HeroProduct() {
  const days = monthGrid(SAMPLE_MONTH);
  const todayPosts = SAMPLE_POSTS.filter((post) => post.date === SAMPLE_TODAY).sort((a, b) => a.time.localeCompare(b.time));
  const [featured, ...drafts] = todayPosts;

  return (
    <figure className="hp" inert>
      <div className="hp-app">
        <div className="hp-bar">
          <Logo size={20} />
          <span className="hp-nav">{NAV.map((item, index) => <span key={item} data-current={index === 0 || undefined}>{item}</span>)}</span>
          <span className="hp-spacer" />
          <span className="hp-conn"><Icon name="check-double" size={14} />LinkedIn connected · 52 days left</span>
          <span className="hp-pause">Pause all<span className="hp-switch" /></span>
          {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
          <img className="hp-avatar" src={SAMPLE_AUTHOR.avatar} alt="" width={32} height={32} />
        </div>
        <div className="hp-body">
          <div className="hp-cal">
            <div className="hp-cal-head">
              <span className="hp-cal-title">October 2026</span>
              <span className="hp-arrows"><span><Icon name="chevron-left" /></span><span><Icon name="chevron-right" /></span></span>
              <span className="hp-spacer" />
              <span className="hp-seg"><span data-current>Month</span><span>List</span></span>
            </div>
            <div className="hp-legend">
              {LEGEND.map((status) => <span key={status} data-tone={POST_STATUS[status].tone}><Icon name={POST_STATUS[status].icon} size={12} />{POST_STATUS[status].label}</span>)}
            </div>
            <div className="hp-grid">
              {WEEKDAYS.map((day) => <span key={day} className="hp-dow">{day}</span>)}
              {days.map((day) => {
                const posts = SAMPLE_POSTS.filter((post) => post.date === day.date);
                return (
                  <div key={day.date} className="hp-day" data-outside={!day.inMonth || undefined} data-today={day.date === SAMPLE_TODAY || undefined}>
                    <span className="hp-num">{day.day}</span>
                    {posts.slice(0, 2).map((post) => (
                      <span key={post.id} className="hp-chip" data-tone={POST_STATUS[post.status].tone}>
                        <Icon name={POST_STATUS[post.status].icon} size={11} />
                        <span className="hp-chip-time">{post.time}</span>
                      </span>
                    ))}
                    {posts.length > 2 && <span className="hp-more">+{posts.length - 2} more</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="hp-panel">
            <div className="hp-panel-head"><span>Wednesday, 14 October</span><span className="hp-muted">{todayPosts.length} posts</span></div>
            <div className="hp-post">
              <div className="hp-post-head">
                {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
                <img src={SAMPLE_AUTHOR.avatar} alt="" width={40} height={40} />
                <span className="hp-post-who"><span>{SAMPLE_AUTHOR.name}</span><span className="hp-muted">Sample profile · <span className="hp-mono">{featured.time}</span></span></span>
                <span className="hp-badge" data-tone="approved"><Icon name="check" size={12} />Approved</span>
              </div>
              <p className="hp-post-text">{featured.text}</p>
              <div className="hp-post-foot">
                <span className="hp-mono hp-muted">{Array.from(featured.text).length} / 3,000</span>
                <span className="hp-spacer" />
                <span className="hp-btn">Edit</span>
                <span className="hp-btn">Stop post</span>
              </div>
            </div>
            {drafts.map((post) => (
              <div key={post.id} className="hp-row">
                <span className="hp-mono hp-muted">{post.time}</span>
                <span className="hp-row-text">{post.text}</span>
                <span className="hp-badge" data-tone="draft"><Icon name="pencil" size={12} />Draft</span>
              </div>
            ))}
            <span className="hp-review">Review {drafts.length} drafts</span>
          </div>
        </div>
      </div>
      <figcaption className="pxt-sr">The Poxeet calendar for October 2026 with sample posts, and Wednesday 14 October open in the day panel.</figcaption>
    </figure>
  );
}
