"use client";

import { useEffect, useState } from "react";
import { Icon } from "../ui";
import { VoiceOrb } from "./voice-orb";

export type JobStep = { label: string; state: "done" | "active" | "todo" };

/**
 * Asks before the tab closes or reloads while a job runs. The job itself runs on the server and keeps going,
 * but members shouldn't wonder whether closing the tab cancelled it.
 */
export function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Some browsers still need returnValue set to show their "Leave site?" dialog.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}

function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

type Props = {
  title: string;
  detail: string;
  /** 0 to 100; null shows an indeterminate bar. */
  percent: number | null;
  steps?: JobStep[];
  /** The opening lines of the latest results, newest first. */
  recent?: string[];
  startedAt?: string | null;
};

/** A running AI job: the orb, a moving bar, its steps, what has landed so far, and how long it has been going. */
export function JobProgress({ title, detail, percent, steps = [], recent = [], startedAt = null }: Props) {
  useLeaveGuard(true);
  const elapsed = useElapsed(startedAt);
  return (
    <section className="wr-card wr-job" aria-live="polite" aria-busy="true">
      <VoiceOrb size={84} label={title} />
      <div className="wr-job-body">
        <div className="wr-job-head">
          <strong className="wr-job-title">{title}</strong>
          {elapsed && <span className="wr-mono wr-small wr-muted">{elapsed}</span>}
        </div>
        <span className="wr-job-bar" data-indeterminate={percent === null || undefined}>
          <span style={percent === null ? undefined : { width: `${Math.max(4, Math.min(100, percent))}%` }} />
        </span>
        <span className="wr-small wr-muted">{detail}</span>
        {steps.length > 0 && (
          <ol className="wr-job-steps">
            {steps.map((step) => (
              <li key={step.label} data-state={step.state}>
                <span className="wr-job-dot">{step.state === "done" ? <Icon name="check" size={11} strokeWidth={2.8} /> : null}</span>
                {step.label}
              </li>
            ))}
          </ol>
        )}
        {recent.length > 0 && (
          <ul className="wr-job-recent" aria-label="Just written">
            {recent.map((line) => <li key={line}><Icon name="sparkle" size={12} />{line}</li>)}
          </ul>
        )}
        <span className="wr-job-note"><Icon name="shield" size={13} />This keeps going on our side even if you close the page.</span>
      </div>
    </section>
  );
}
