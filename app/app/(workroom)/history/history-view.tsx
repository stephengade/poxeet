"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { LinkedInLogo } from "../../../../components/brand/channel-logos";
import { MONTHS } from "../../../../components/calendar/dates";
import { firstLine, PageHead, shortDay, StatusTag } from "../../../../components/preview/parts";
import { Button, EmptyState } from "../../../../components/ui";
import type { PostStatus } from "../../../../lib/post-status";
import { resolveNeedsCheck } from "../posts/actions";

export type HistoryRow = {
  id: string; date: string; time: string; text: string; status: PostStatus; reason: string | null; link: string | null; byHand: boolean;
};

type Filter = "all" | "posted" | "attention";

const REASON: Partial<Record<PostStatus, string>> = {
  needs_check: "We couldn't confirm it went out. Look on LinkedIn, then tell Poxeet what happened.",
  missed: "It was more than a day late, so it wasn't sent. Move it to a new time or post it by hand.",
};

/** Sent posts by month, plus anything that needs the member: failed, unconfirmed or missed. */
export function HistoryView({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();
  const attention = rows.filter((row) => row.status !== "posted");
  const shown = rows.filter((row) => filter === "all" || (filter === "posted" ? row.status === "posted" : row.status !== "posted"));
  const months = shown.reduce<Array<{ key: string; rows: HistoryRow[] }>>((groups, row) => {
    const key = row.date.slice(0, 7);
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
    return groups;
  }, []);
  const pills: Array<[Filter, string]> = [["all", `All ${rows.length}`], ["posted", `Posted ${rows.length - attention.length}`], ["attention", `Needs attention ${attention.length}`]];

  function resolve(id: string, outcome: "posted" | "approved") {
    start(async () => {
      const result = await resolveNeedsCheck(id, outcome);
      if (!result.ok) return void toast.error(result.message);
      toast.success(outcome === "posted" ? "Marked as posted." : "It goes out on the next run.");
      router.refresh();
    });
  }

  return (
    <div className="wr-page">
      <PageHead
        title="History"
        sub="Everything Poxeet sent, and anything that didn't go out, with the reason."
        actions={rows.length > 0 && (
          <div className="wr-filter" role="group" aria-label="Filter">
            {pills.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} data-kind={id} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
        )}
      />
      {rows.length === 0 ? (
        <div className="wr-card">
          <EmptyState title="Nothing sent yet" icon="clock" action={<Button href="/app/drafts">Review drafts</Button>}>
            Approved posts go out at their time and show here, with a link to each one on LinkedIn.
          </EmptyState>
        </div>
      ) : months.length === 0 ? (
        <div className="wr-card"><EmptyState title="Nothing here" icon="check-double">Every post in this list went out.</EmptyState></div>
      ) : months.map((month) => {
        const [year, number] = month.key.split("-").map(Number);
        return (
          <section key={month.key} className="wr-card wr-table-card" aria-label={`${MONTHS[number - 1]} ${year}`}>
            <div className="wr-table-month">{MONTHS[number - 1]} {year}</div>
            <ul className="wr-history">
              {month.rows.map((row) => (
                <li key={row.id} data-status={row.status}>
                  <span className="wr-history-when"><strong>{shortDay(row.date)} {MONTHS[number - 1].slice(0, 3)}</strong><span className="wr-mono">{row.time}</span></span>
                  <span className="wr-history-main">
                    <Link href={`/app/posts/${row.id}`} className="wr-history-title"><strong>{firstLine(row.text)}</strong></Link>
                    {row.status !== "posted"
                      ? <span className="wr-history-reason">{row.reason ?? REASON[row.status]}</span>
                      : row.link ? <a href={row.link} target="_blank" rel="noreferrer" className="wr-link wr-small">View on LinkedIn ↗</a>
                        : <span className="wr-small wr-muted">{row.byHand ? "Posted by hand" : "Posted"}</span>}
                  </span>
                  <span className="wr-history-channel"><LinkedInLogo size={16} />LinkedIn</span>
                  <span className="wr-history-status">
                    <StatusTag status={row.status} />
                    {row.status === "needs_check" && (
                      <span className="wr-actions">
                        <Button size="sm" disabled={pending} onClick={() => resolve(row.id, "posted")}>It went out</Button>
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => resolve(row.id, "approved")}>Send again</Button>
                      </span>
                    )}
                    {(row.status === "failed" || row.status === "missed") && <Button size="sm" variant="secondary" href={`/app/posts/${row.id}`}>{row.status === "failed" ? "Fix and retry" : "Reschedule"}</Button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="wr-small wr-muted">Posts you copy and post by hand show here too. <Link href="/app/calendar" className="wr-link">Back to calendar</Link></p>
    </div>
  );
}
