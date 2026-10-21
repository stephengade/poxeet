"use client";

import { Banner, Button, Icon } from "../../../../components/ui";
import type { StartResult } from "../voice/actions";

const FIX: Record<string, { label: string; href: string }> = {
  no_credits: { label: "Buy credits", href: "/app/settings/credits?buy=1" },
  no_access: { label: "Set up AI access", href: "/app/settings/ai" },
  not_configured: { label: "AI access", href: "/app/settings/ai" },
};

/**
 * After posts are saved: what voice analysis is doing now, or why it couldn't start and how to fix that.
 * `analysis` is null when there aren't enough posts yet to analyse.
 */
export function AnalysisNext({ analysis, onMore, moreLabel }: { analysis: StartResult | null; onMore: () => void; moreLabel: string }) {
  if (analysis && !analysis.ok) {
    const fix = FIX[analysis.reason];
    return (
      <>
        <Banner tone="warning" title="Your posts are saved, but analysis couldn't start" action={fix ? <Button size="sm" href={fix.href}>{fix.label}</Button> : undefined}>
          {analysis.message} Once that&apos;s sorted, start it from Voice.
        </Banner>
        <div className="wr-actions">
          <Button href="/app/voice" variant="secondary">Go to Voice</Button>
          <Button variant="ghost" icon="plus" onClick={onMore}>{moreLabel}</Button>
        </div>
      </>
    );
  }
  return (
    <>
      <div>
        <h3 className="wr-h2">What happens next</h3>
        <ul className="wr-buy-facts wr-voice-next">
          <li>
            <Icon name={analysis ? "spinner" : "sparkle"} size={16} />
            <span>
              {analysis
                ? "Poxeet is analysing your voice now: how you open and close, sentence length, tone, formatting and the topics you come back to."
                : "Voice analysis reads how you open and close, your sentence length, tone, formatting and the topics you come back to."}
            </span>
          </li>
          <li><Icon name="clock" size={16} /><span>It usually takes under a minute. You can leave this page; it&apos;s saved when it&apos;s done.</span></li>
          <li><Icon name="voice" size={16} /><span>Your voice profile then appears in Voice, where you can read every part before Poxeet drafts anything.</span></li>
        </ul>
      </div>
      <div className="wr-actions">
        <Button href="/app/voice" iconRight="arrow-right">{analysis ? "Watch it in Voice" : "Go to Voice"}</Button>
        <Button variant="secondary" icon="plus" onClick={onMore}>{moreLabel}</Button>
      </div>
    </>
  );
}
