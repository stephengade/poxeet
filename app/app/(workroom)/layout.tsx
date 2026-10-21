import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "../../../components/workroom/app-shell";
import { billingEnabled } from "../../../lib/billing/config";
import { isLowBalance } from "../../../lib/billing/rates";
import { getMember, setupSteps } from "../../../lib/member";
import "../../../components/workroom/workroom.css";

export const metadata: Metadata = { title: "Poxeet", robots: { index: false, follow: false } };

// The signed-in workroom. proxy.ts has already checked the session, the account status and onboarding.
async function Workroom({ children }: { children: ReactNode }) {
  const member = await getMember();
  const { steps, done, total } = setupSteps(member);
  const next = steps.find((step) => !step.done && step.href);
  // Billing on: Credits in the sidebar; the balance shows when credits are what pays for this member's AI.
  const usesCredits = member.setup.ai === "credits" || member.setup.ai === "none";
  const balance = usesCredits ? member.setup.credits : null;
  const credits = billingEnabled() ? { balance, low: balance !== null && isLowBalance(balance) } : undefined;
  return (
    <AppShell
      me={{ name: member.name, email: member.email }} drafts={member.drafts} linkedin={member.setup.linkedin} paused={member.paused}
      setup={{ done, total, next: next?.href ? { title: next.title, href: next.href } : null }}
      credits={credits}
    >
      {children}
    </AppShell>
  );
}

export default function WorkroomLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="wr-shell"><div className="wr-loading" aria-busy="true" /></div>}>
      <Workroom>{children}</Workroom>
    </Suspense>
  );
}
