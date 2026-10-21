"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ATTENTION_STATUSES, type PostStatus } from "../../lib/post-status";
import { PostChip } from "../post/post-chip";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { addDays, MONTHS, monthGrid, shiftMonth, WEEKDAYS, WEEKDAYS_LONG } from "./dates";

export type CalendarPost = { id: string | number; date: string; time: string; text: string; status: PostStatus };

type Props = {
  /** "2026-10". Controlled; pair with onMonthChange. */
  month?: string;
  defaultMonth?: string;
  onMonthChange?: (month: string) => void;
  /** "2026-10-14", in the member's timezone. */
  today: string;
  posts?: CalendarPost[];
  selected?: string | null;
  defaultSelected?: string | null;
  onSelectDay?: (date: string, posts: CalendarPost[]) => void;
  /** View tabs and filters, shown in the toolbar. */
  controls?: ReactNode;
  maxChips?: number;
  className?: string;
};

const ARROW_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** The home screen: a month with weeks starting Monday, two chips per day and an alert marker on days that need attention. */
export function CalendarMonth({ month, defaultMonth, onMonthChange, today, posts = [], selected, defaultSelected = null, onSelectDay, controls, maxChips = 2, className }: Props) {
  const [ownMonth, setOwnMonth] = useState(defaultMonth ?? today.slice(0, 7));
  const [ownSelected, setOwnSelected] = useState(defaultSelected);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const shownMonth = month ?? ownMonth;
  const selectedDate = selected !== undefined ? selected : ownSelected;

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of posts) map.set(post.date, [...(map.get(post.date) ?? []), post]);
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [posts]);

  const days = monthGrid(shownMonth);
  const [year, monthNumber] = shownMonth.split("-").map(Number);
  const title = `${MONTHS[monthNumber - 1]} ${year}`;
  const tabStop = days.some((d) => d.date === focusDate) ? focusDate
    : days.some((d) => d.date === selectedDate) ? selectedDate
      : days.some((d) => d.date === today) ? today
        : days.find((d) => d.inMonth)?.date;

  function goToMonth(next: string) {
    if (month === undefined) setOwnMonth(next);
    onMonthChange?.(next);
  }

  function select(date: string) {
    if (selected === undefined) setOwnSelected(date);
    onSelectDay?.(date, byDate.get(date) ?? []);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = ARROW_STEPS[event.key];
    const current = (event.target as HTMLElement).dataset.date;
    if (!step || !current) return;
    event.preventDefault();
    const next = addDays(current, step);
    if (next.slice(0, 7) !== shownMonth && !days.some((d) => d.date === next)) goToMonth(next.slice(0, 7));
    setFocusDate(next);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  }

  return (
    <div className={cn("pxt-cal", className)}>
      <div className="pxt-cal-bar">
        <h2 className="pxt-cal-title">{title}</h2>
        {controls}
        <div className="pxt-cal-nav">
          <Button variant="secondary" size="sm" onClick={() => goToMonth(today.slice(0, 7))}>Today</Button>
          <Button variant="ghost" size="sm" icon="chevron-left" aria-label="Previous month" onClick={() => goToMonth(shiftMonth(shownMonth, -1))} />
          <Button variant="ghost" size="sm" icon="chevron-right" aria-label="Next month" onClick={() => goToMonth(shiftMonth(shownMonth, 1))} />
        </div>
      </div>
      <div className="pxt-cal-scroll">
        <div className="pxt-cal-grid" role="grid" aria-label={title} ref={grid} onKeyDown={onKeyDown}>
          {WEEKDAYS.map((day) => <div key={day} className="pxt-cal-dow" role="columnheader">{day}</div>)}
          {days.map((day) => {
            const dayPosts = byDate.get(day.date) ?? [];
            const attention = dayPosts.some((post) => ATTENTION_STATUSES.includes(post.status));
            const count = dayPosts.length === 0 ? "no posts" : dayPosts.length === 1 ? "1 post" : `${dayPosts.length} posts`;
            const label = `${WEEKDAYS_LONG[day.weekday]} ${day.day} ${day.monthName}, ${count}${attention ? ", needs attention" : ""}${day.date === today ? ", today" : ""}`;
            return (
              <button
                key={day.date}
                type="button"
                className="pxt-day"
                data-date={day.date}
                data-today={day.date === today || undefined}
                data-past={day.date < today || undefined}
                data-outside={!day.inMonth || undefined}
                aria-label={label}
                aria-pressed={selectedDate === day.date}
                tabIndex={day.date === tabStop ? 0 : -1}
                onFocus={() => setFocusDate(day.date)}
                onClick={() => select(day.date)}
              >
                <span className="pxt-day-head">
                  <span className="pxt-day-num">{day.day}</span>
                  {attention && <span className="pxt-day-alert"><Icon name="alert" size={14} /></span>}
                </span>
                {dayPosts.slice(0, maxChips).map((post) => <PostChip key={post.id} time={post.time} text={post.text} status={post.status} interactive={false} />)}
                {dayPosts.length > maxChips && <span className="pxt-day-more">+{dayPosts.length - maxChips} more</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
