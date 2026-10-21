import { MONTHS, mondayIndex, parseIsoDate, WEEKDAYS } from "../calendar/dates";
import { openingWords } from "../post/post-chip";
import { Badge } from "../ui/badge";
import { SAMPLE_POSTS } from "./sample-calendar";

/** Cards cycle through the six tones (design-tokens.json, tone-*), full strength once approved, lighter as drafts. */
function Row({ posts, reverse, offset = 0 }: { posts: typeof SAMPLE_POSTS; reverse?: boolean; offset?: number }) {
  // Each row is drawn twice so the loop is seamless; the copy is hidden from assistive tech.
  return (
    <div className="wall-row" data-reverse={reverse || undefined}>
      {[...posts, ...posts].map((post, index) => {
        const day = parseIsoDate(post.date);
        return (
          <article key={index} className="wall-card" data-tone={(index % posts.length + offset) % 6} data-status={post.status} aria-hidden={index >= posts.length || undefined}>
            <div className="wall-card-head">
              <span className="wall-when">{WEEKDAYS[mondayIndex(day)]} {day.getUTCDate()} {MONTHS[day.getUTCMonth()].slice(0, 3)} · {post.time}</span>
              <Badge status={post.status} />
            </div>
            <p>{openingWords(post.text, 34)}</p>
          </article>
        );
      })}
    </div>
  );
}

/** Two slow rows of a month's sample drafts, drifting in opposite directions. */
export function PostWall() {
  const half = Math.ceil(SAMPLE_POSTS.length / 2);
  return (
    <div className="wall">
      <Row posts={SAMPLE_POSTS.slice(0, half)} />
      <Row posts={SAMPLE_POSTS.slice(half)} reverse offset={3} />
    </div>
  );
}
