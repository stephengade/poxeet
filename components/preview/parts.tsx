import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { POST_STATUS, type PostStatus } from "../../lib/post-status";
import { MONTHS, mondayIndex, parseIsoDate, WEEKDAYS, WEEKDAYS_LONG } from "../calendar/dates";
import { Icon } from "../ui";

/** A page's opening block: title and summary on the left, its actions on the right. Plain, on the page ground. */
export function SkyBand({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("wr-sky", className)}><div className="wr-sky-inner">{children}</div></section>;
}

/** Title row for pages without a sky band. */
export function PageHead({ title, sub, actions, badge }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="wr-head">
      <div>
        <div className="wr-title-row"><h1 className="wr-title">{title}</h1>{badge}</div>
        {sub && <p className="wr-sub">{sub}</p>}
      </div>
      {actions && <div className="wr-actions">{actions}</div>}
    </div>
  );
}

/** Small status label: icon plus word, colored by meaning. */
export function StatusTag({ status, children }: { status: PostStatus; children?: ReactNode }) {
  const look = POST_STATUS[status];
  return <span className="wr-tag" data-status={status}><Icon name={look.icon} size={12} strokeWidth={2.2} />{children ?? look.label}</span>;
}

export function shortDay(date: string) {
  const day = parseIsoDate(date);
  return `${WEEKDAYS[mondayIndex(day)]} ${day.getUTCDate()}`;
}

export function longDay(date: string) {
  const day = parseIsoDate(date);
  return `${WEEKDAYS_LONG[mondayIndex(day)]}, ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
}

export function firstLine(text: string) {
  return text.split("\n")[0];
}
