import Link from "next/link";
import type { ReactNode } from "react";
import { PageHead } from "../preview/parts";
import { Button, EmptyState, Icon, type IconName } from "../ui";

type Step = { id: string; title: string; done: boolean; locked: boolean; todo: string; doneText: string; href: string | null };

/** The first-run steps with their real state. The first unfinished one is "current". */
export function SetupList({ steps }: { steps: readonly Step[] }) {
  const current = steps.find((step) => !step.done)?.id;
  return (
    <ol className="wr-card wr-steps" aria-label="Setup steps">
      {steps.map((step, index) => (
        <li key={step.id} data-state={step.done ? "done" : step.id === current ? "current" : "upcoming"}>
          <span className="wr-step-mark">{step.done ? <Icon name="check" size={14} strokeWidth={2.6} /> : step.locked ? <Icon name="lock" size={12} /> : index + 1}</span>
          <span>
            <strong>{step.href && !step.locked ? <Link href={step.href} className="wr-step-link">{step.title}</Link> : step.title}</strong>
            <span className="wr-small">{step.done ? step.doneText : step.locked ? `Unlocks after: ${steps[index - 1]?.title.toLowerCase()}.` : step.todo}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

type EmptyCopy = { title: string; text: ReactNode; action?: { label: string; href: string } | null };

/**
 * A section with nothing in it yet: what will appear here, and setup as the way to get there. Pass `ready` (and
 * `setupDone`) for what to say once setup is finished, so the page stops sending a finished member back to setup.
 */
export function EmptySection({ title, sub, icon, empty, ready, setupDone = false }: {
  title: string; sub: string; icon: IconName; empty: EmptyCopy; ready?: EmptyCopy; setupDone?: boolean;
}) {
  const copy = setupDone && ready ? ready : empty;
  const action = copy === empty && !setupDone ? { label: "Continue setup", href: "/app/setup" } : copy.action;
  return (
    <div className="wr-page">
      <PageHead title={title} sub={sub} />
      <EmptyState title={copy.title} icon={icon} action={action ? <Button href={action.href} size="sm">{action.label}</Button> : undefined}>
        {copy.text}
      </EmptyState>
    </div>
  );
}

/** Shown instead of a step's screen while an earlier step isn't done. */
export function LockedStep({ title, blocker }: { title: string; blocker: { title: string; href: string | null } }) {
  return (
    <div className="wr-card wr-stack wr-locked-step">
      <span className="wr-locked-icon"><Icon name="lock" size={18} /></span>
      <div>
        <h2 className="wr-h2">{title} is locked</h2>
        <p className="wr-sub wr-small">Setup goes one step at a time. {blocker.title} first, then this opens.</p>
      </div>
      {blocker.href && <div className="wr-actions"><Button href={blocker.href}>{blocker.title}</Button></div>}
    </div>
  );
}
