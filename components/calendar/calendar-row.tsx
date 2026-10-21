import { Fragment, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { PostStatus } from "../../lib/post-status";
import { Badge } from "../ui/badge";
import { mondayIndex, parseIsoDate, WEEKDAYS } from "./dates";

type Props = { date: string; time?: string; text: string; status?: PostStatus; pillar?: string; postType?: string; onClick?: () => void; className?: string };

/** One post in the calendar's list view. Stack rows inside a CalendarList. */
export function CalendarRow({ date, time, text, status = "draft", pillar, postType, onClick, className }: Props) {
  const day = parseIsoDate(date);
  const meta: ReactNode[] = [time && <span className="pxt-mono">{time}</span>, pillar, postType].filter(Boolean);
  return (
    <button type="button" className={cn("pxt-row-item", className)} onClick={onClick}>
      <span className="pxt-row-date">
        <span className="pxt-row-dow">{WEEKDAYS[mondayIndex(day)]}</span>
        <span className="pxt-row-day">{day.getUTCDate()}</span>
      </span>
      <span className="pxt-row-main">
        <span className="pxt-row-text">{text.replace(/\s+/g, " ")}</span>
        <span className="pxt-row-meta">
          {meta.map((item, index) => <Fragment key={index}>{index > 0 && <span aria-hidden="true">·</span>}{item}</Fragment>)}
        </span>
      </span>
      <Badge status={status} />
    </button>
  );
}

export function CalendarList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("pxt-list", className)}>{children}</div>;
}
