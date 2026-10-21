import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { POST_STATUS, type PostStatus } from "../../lib/post-status";
import { monthGrid } from "../calendar/dates";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icon";
import { Reveal } from "./motion";
import { SAMPLE_MONTH, SAMPLE_POSTS } from "./sample-calendar";

function Cell({ title, text, wide, index, visual, children }: { title: string; text: string; wide?: boolean; index: number; visual?: string; children: ReactNode }) {
  return (
    <Reveal className={cn("bento-cell", wide && "bento-wide")} delay={index * 80}>
      <div className={cn("bento-visual", visual)} aria-hidden="true" inert>{children}</div>
      <div className="bento-copy">
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </Reveal>
  );
}

const IMPORTED = [["Oct 02", "The best feedback I got this year came from a support ticket."], ["Oct 05", "Three things I'd tell my first-year self about scope."], ["Oct 07", "We shipped the boring version first."]];
const PROFILE = [["Tone", "Direct, warm, never salesy"], ["Shape", "Short lines, lots of air"], ["Opens", "A plain, specific claim"], ["Closes", "One question to the reader"], ["Avoids", "Hashtags and buzzwords"]];
const WEEK: Array<[string, PostStatus]> = [["Mon 09:00", "posted"], ["Wed 09:00", "posting"], ["Fri 09:00", "approved"], ["Sun 17:00", "draft"]];

/** Feature bento: each picture is a small, still slice of the real interface. */
export function Bento() {
  const statusByDay = new Map(SAMPLE_POSTS.map((post) => [post.date, post.status]));
  return (
    <div className="bento">
      <Cell index={0} wide visual="bv-dots" title="Learns how you write" text="Import your LinkedIn export or paste past posts. Poxeet writes a voice profile in plain words you can read, edit and version.">
        <div className="bv-voice">
          <div className="bv-imports">
            {IMPORTED.map(([date, text]) => <div key={date} className="bv-import"><span>{date}</span>{text}</div>)}
          </div>
          <svg className="bv-join" width="72" height="212" viewBox="0 0 72 212" fill="none"><path d="M0 32 C40 32 32 106 69 106 M0 106 H69 M0 180 C40 180 32 106 69 106" /><circle cx="69" cy="106" r="3" /></svg>
          <div className="bv-profile">
            <div className="bv-profile-head"><span>Voice profile v1</span><Badge tone="brand" icon="check">Active</Badge></div>
            <dl>{PROFILE.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
          </div>
        </div>
      </Cell>

      <Cell index={1} visual="bv-glow" title="Plans the month" text="Choose posts per week and your times. Drafts arrive a week at a time, from your brief and topics.">
        <div className="bv-month">
          <div className="bv-month-grid">
            {monthGrid(SAMPLE_MONTH).map((day) => {
              const status = day.inMonth ? statusByDay.get(day.date) : undefined;
              return <span key={day.date} data-outside={!day.inMonth || undefined} data-tone={status ? POST_STATUS[status].tone : undefined} />;
            })}
          </div>
          <span className="bv-mono">30 days · 3 a week · 09:00</span>
        </div>
      </Cell>

      <Cell index={2} visual="bv-dots" title="You approve every post" text="Nothing goes out until you say so. Edit it, regenerate it with a note, or skip it.">
        <div className="bv-approve">
          <div className="bv-approve-head"><span className="bv-mono">Wed 12:30</span><Badge status="draft" /></div>
          <p>Quick question for founders: what&apos;s on your pricing page that you would remove if nobody was watching?</p>
          <div className="bv-approve-actions"><span className="bv-btn">Skip</span><span className="bv-btn bv-btn-brand">Approve</span></div>
          <svg className="bv-cursor" width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 7-6 2-2 6z" /></svg>
        </div>
      </Cell>

      <Cell index={3} wide visual="bv-sky" title="Posts on schedule" text="Approved posts publish at their slot, in your timezone. If one fails, you get an email with the reason and how to fix it.">
        <div className="bv-week">
          <div className="bv-week-head"><span>This week</span><span>Approved posts go out at their slot</span></div>
          <div className="bv-week-line" />
          <ol className="bv-week-steps">
            {WEEK.map(([when, status]) => (
              <li key={when} data-tone={POST_STATUS[status].tone}>
                {status === "posting" && <span className="bv-tip">Being sent · 09:00</span>}
                <span className="bv-node">{status !== "draft" && status !== "posting" && <Icon name={POST_STATUS[status].icon} size={12} strokeWidth={2.25} />}</span>
                <span className="bv-mono">{when}</span>
                <span>{POST_STATUS[status].label}</span>
              </li>
            ))}
          </ol>
        </div>
      </Cell>
    </div>
  );
}
