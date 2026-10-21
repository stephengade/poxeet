"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { BuyCredits, type PackView } from "../../../../../components/workroom/buy-credits";
import { Button } from "../../../../../components/ui";
import { CREDIT_EXPIRY_MONTHS, creditValue, minPurchase } from "../../../../../lib/billing/config";
import { money } from "../../../../../lib/billing/money";
import { chooseCredits } from "./actions";

type Props = {
  /** Which option to show first: the one the member is using, else credits. */
  initial: "credits" | "own_key";
  balance: number;
  weeks: number;
  weeklyCost: number;
  returnTo: string;
  /** Free credits on offer to this member, or 0 when they've had them (or the instance gives none). */
  starter: number;
  packs: PackView[];
  /** The own-key form, rendered by the server page. */
  keyForm: ReactNode;
  next?: { label: string; href: string } | null;
};

/** Setup step 2 when billing is on: pay for AI with Poxeet credits, or bring your own key. */
export function AccessChoice({ initial, balance, weeks, weeklyCost, returnTo, starter, packs, keyForm, next }: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState(initial);
  // Packs come in the visitor's currency (D-033): naira in Nigeria, dollars elsewhere.
  const currency = packs[0]?.currency ?? "USD";
  const from = money(packs.length ? Math.min(...packs.map((pack) => pack.price)) : minPurchase(currency), currency);
  const [pending, start] = useTransition();

  function claim() {
    start(async () => {
      const result = await chooseCredits();
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.granted ? `${result.granted} free credits added.` : "Credits are ready.", {
        description: "Enough to analyse your voice and try a few drafts.",
        ...(next ? { action: { label: next.label, onClick: () => router.push(next.href) }, duration: 10_000 } : {}),
      });
      router.refresh();
    });
  }

  return (
    <div className="wr-stack">
      <fieldset className="wr-choice" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="wr-small wr-muted" style={{ padding: 0, marginBottom: 8 }}>How do you want to pay for AI?</legend>
        <label>
          <input type="radio" name="ai-access" value="credits" checked={choice === "credits"} onChange={() => setChoice("credits")} />
          <span><strong>Use Poxeet credits</strong>Pay as you go from {from}. Nothing to set up.</span>
        </label>
        <label>
          <input type="radio" name="ai-access" value="own_key" checked={choice === "own_key"} onChange={() => setChoice("own_key")} />
          <span><strong>Use your own key</strong>Claude, OpenAI or DeepSeek, billed by them.</span>
        </label>
      </fieldset>

      {choice === "credits" ? (
        <section className="wr-card wr-settings-card">
          <div className="wr-settings-card-head wr-settings-card-row">
            <div>
              <h3 className="wr-h2">{balance > 0 ? `${balance.toLocaleString("en-US")} credits` : "Poxeet credits"}</h3>
              <p className="wr-sub wr-small">
                {balance > 0
                  ? weeks > 0 ? `About ${weeks} ${weeks === 1 ? "week" : "weeks"} of drafts at a typical pace.` : "Less than a week of drafts left."
                  : `1 credit is ${money(creditValue(1, currency), currency)}. AI work is charged by the words it reads and writes. Credits expire ${CREDIT_EXPIRY_MONTHS} months after purchase.`}
              </p>
            </div>
            <span className="wr-actions">
              {starter > 0 && <Button onClick={claim} loading={pending}>Start with {starter} free credits</Button>}
              <BuyCredits packs={packs} balance={balance} weeklyCost={weeklyCost} returnTo={returnTo} variant={starter > 0 ? "secondary" : "primary"} />
              {balance > 0 && <Button href="/app/settings/credits" variant="ghost">Manage</Button>}
            </span>
          </div>
        </section>
      ) : keyForm}
    </div>
  );
}
