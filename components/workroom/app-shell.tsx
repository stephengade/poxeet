"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { setPublishingPaused } from "../../app/app/(workroom)/actions";
import { WorkroomFrame, type LinkedInState, type SetupProgress } from "./frame";

type Props = {
  me: { name: string; email: string };
  drafts: number;
  linkedin: LinkedInState;
  paused: boolean;
  setup: SetupProgress;
  credits?: { balance: number | null; low: boolean };
  children: ReactNode;
};

/** The real app's frame: the shared workroom frame with the member's data and a working publishing switch. */
export function AppShell({ me, drafts, linkedin, paused, setup, credits, children }: Props) {
  const [shownPaused, setShownPaused] = useOptimistic(paused);
  const [, startTransition] = useTransition();

  function togglePause() {
    const next = !shownPaused;
    startTransition(async () => {
      setShownPaused(next);
      const result = await setPublishingPaused(next);
      if (!result.ok) toast.error(result.message);
      else toast.success(next ? "Publishing is paused." : "Publishing is on again.", {
        description: next ? "Nothing goes out until you turn it back on." : "Approved posts go out at their times.",
      });
    });
  }

  return (
    <WorkroomFrame base="/app" me={me} drafts={drafts} linkedin={linkedin} paused={shownPaused} onTogglePause={togglePause} setup={setup} credits={credits} signOut>
      {children}
    </WorkroomFrame>
  );
}
