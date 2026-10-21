import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyCredits } from "../../../../../components/workroom/buy-credits";
import { SettingsHead } from "../../../../../components/workroom/settings-head";
import { Banner, Icon, type IconName } from "../../../../../components/ui";
import { creditsAvailable } from "../../../../../lib/ai/server";
import { billingEnabled, CREDIT_EXPIRY_MONTHS, creditValue } from "../../../../../lib/billing/config";
import { money } from "../../../../../lib/billing/money";
import { packsIn, pricingCurrency } from "../../../../../lib/billing/region";
import { creditHistory, currentCredits, listPacks, nextExpiry, type HistoryEntry } from "../../../../../lib/billing/credits";
import { isLowBalance, weeklyCost, weeksLeft } from "../../../../../lib/billing/rates";
import { appUrl } from "../../../../../lib/config";
import { getMember } from "../../../../../lib/member";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { PurchaseStatus } from "./purchase-status";

// Settings → Credits (PRD BILL-7): balance, how long it lasts, packs to buy, and every purchase, use and refund.
// Exists only when BILLING_ENABLED is on.

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const count = (value: number) => value.toLocaleString("en-US");

const CHECKOUT_RESULT: Record<string, { tone: "success" | "info" | "warning" | "critical"; title: string; text: string }> = {
  cancelled: { tone: "info", title: "Checkout cancelled", text: "Nothing was charged." },
  bad_amount: { tone: "warning", title: "Choose a different amount", text: "That amount is outside what a single purchase can be." },
  unknown_pack: { tone: "warning", title: "That pack isn't available", text: "Pick one of the packs below." },
  naira_nigeria_only: { tone: "warning", title: "Naira checkout is for payments from Nigeria", text: "Pick one of the dollar packs below." },
  suspended: { tone: "critical", title: "Purchases are paused on your account", text: "Contact the operator of this instance." },
  not_configured: { tone: "critical", title: "Payments aren't set up yet", text: "The operator hasn't finished connecting payments. Try again later." },
  not_public: { tone: "critical", title: "Checkout needs a public address", text: "Bachs can't send you back to localhost. Set APP_URL to this site's public address (locally, a tunnel), open the app there, and try again." },
  error: { tone: "critical", title: "We couldn't open checkout", text: "Nothing was charged. Try again in a minute." },
};

/** Results that come back from a payment: the banner shows that checkout's real status, not this word. */
const PURCHASE_RESULTS = new Set(["paid", "pending", "success"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_LABEL: Record<HistoryEntry["kind"], string> = {
  purchase: "Purchase", grant: "Free credits", usage: "AI work", refund: "Refund", adjustment: "Adjustment", expiry: "Expired",
};

const JOB_LABEL: Record<string, string> = { analyze: "Voice analysis", draft: "Drafting", rewrite: "Rewrite", review: "Review" };

const KIND_ICON: Record<HistoryEntry["kind"], IconName> = {
  purchase: "card", grant: "sparkle", usage: "pencil", refund: "refresh", adjustment: "sliders", expiry: "clock",
};
const JOB_ICON: Record<string, IconName> = { analyze: "voice", draft: "pencil", rewrite: "sparkle", review: "check" };

function iconFor(entry: HistoryEntry): IconName {
  return entry.kind === "usage" && entry.job ? JOB_ICON[entry.job] ?? KIND_ICON.usage : KIND_ICON[entry.kind];
}

function describe(entry: HistoryEntry) {
  if (entry.kind === "usage") return entry.job ? JOB_LABEL[entry.job] ?? entry.job : KIND_LABEL.usage;
  return entry.note ?? KIND_LABEL[entry.kind];
}

export default async function CreditSettings({ searchParams }: { searchParams: Promise<{ checkout?: string; buy?: string; session?: string }> }) {
  if (!billingEnabled()) notFound();
  const [member, { checkout, buy, session }] = await Promise.all([getMember(), searchParams]);
  const [balance, allPacks, history, expiry, currency] = await Promise.all([
    currentCredits(member.id), listPacks(), creditHistory(member.id), nextExpiry(member.id), pricingCurrency(),
  ]);
  // Naira in Nigeria, dollars elsewhere (D-033); both buy the same credits.
  const packs = packsIn(allPacks, currency);
  const shown = packs[0]?.currency ?? currency;
  const from = packs.length ? money(Math.min(...packs.map((pack) => pack.price)), shown) : null;
  const added = history.filter((entry) => entry.delta > 0).reduce((sum, entry) => sum + entry.delta, 0);
  const used = history.filter((entry) => entry.delta < 0).reduce((sum, entry) => sum - entry.delta, 0);
  const weeks = weeksLeft(balance);
  const usingOther = member.setup.ai === "own_key" || member.setup.ai === "instance_key";
  const result = checkout && !PURCHASE_RESULTS.has(checkout) ? CHECKOUT_RESULT[checkout] : null;
  // Back from paying: this member's checkout, as it really stands. Without a valid id (an old link), nothing.
  const purchase = checkout && PURCHASE_RESULTS.has(checkout) && session && UUID.test(session)
    ? (await createAdminClient().from("checkout_sessions").select("id, status, credits").eq("id", session).eq("user_id", member.id).maybeSingle()).data
    : null;
  const buyButton = (props: { size?: "sm" | "md"; variant?: "primary" | "secondary"; defaultOpen?: boolean }) => (
    <BuyCredits packs={packs} balance={balance} weeklyCost={weeklyCost()} returnTo={appUrl()} {...props} />
  );

  return (
    <>
      <SettingsHead title="Credits">Pay for AI as you go{from ? `, from ${from}` : ""}. No subscription; credits expire {CREDIT_EXPIRY_MONTHS} months after you buy them.</SettingsHead>

      {result && <Banner tone={result.tone} title={result.title}>{result.text}</Banner>}
      {purchase && (purchase.status === "paid" || purchase.status === "pending") && (
        <PurchaseStatus sessionId={purchase.id} initial={purchase.status} credits={purchase.credits} />
      )}
      {!creditsAvailable() ? (
        <Banner tone="warning" title="Credits can't be used yet">
          The operator hasn&apos;t set up the shared AI key that credits pay for. Add your own key in AI access to keep going.
        </Banner>
      ) : usingOther ? (
        <Banner tone="info" title={member.setup.ai === "own_key" ? "You're using your own key" : "You're using the instance key"}>
          Credits aren&apos;t used while {member.setup.ai === "own_key" ? "your own key is saved" : "your admin's grant is on"}. They stay here for later.
        </Banner>
      ) : isLowBalance(balance) && (
        <Banner tone={balance > 0 ? "warning" : "critical"} title={balance > 0 ? "Credits are running low" : "You're out of credits"}
          action={buyButton({ size: "sm", variant: "secondary" })}>
          {balance > 0 ? "Less than a week of drafts left. Top up below so drafting doesn't stop." : "Drafting and rewrites are paused until you top up or add your own key."}
        </Banner>
      )}

      <section className="wr-card wr-settings-card">
        <div className="wr-settings-card-head wr-settings-card-row">
          <div>
            <h3 className="wr-h2">Balance</h3>
            <div className="wr-balance">
              <strong>{count(balance)}</strong>
              <span>
                {balance > 0 ? (weeks > 0 ? `credits · about ${weeks} ${weeks === 1 ? "week" : "weeks"} of drafts left` : "credits · less than a week of drafts left") : "credits"}
              </span>
            </div>
            <p className="wr-sub wr-small">
              1 credit is {money(creditValue(1, shown), shown)}. AI work is charged by the words it reads and writes.
              {expiry ? ` Your oldest credits expire ${DATE.format(new Date(expiry))}.` : ""}{" "}
              <Link href="/pricing" className="wr-link">How pricing works</Link>
            </p>
          </div>
          {buyButton({ defaultOpen: buy === "1" })}
        </div>
      </section>

      <section className="wr-card wr-settings-card wr-table-card">
        <div className="wr-settings-card-head wr-settings-card-row">
          <div>
            <h3 className="wr-h2">History</h3>
            <p className="wr-sub wr-small">Purchases, free credits, AI work, refunds and expired credits. The latest 50.</p>
          </div>
          {history.length > 0 && (
            <div className="wr-ledger-sum" aria-label="In this list">
              <span data-dir="in"><strong>+{count(added)}</strong>added</span>
              <span data-dir="out"><strong>−{count(used)}</strong>used</span>
            </div>
          )}
        </div>
        {history.length ? (
          <div className="wr-table-wrap">
            <table className="wr-table wr-ledger">
              <thead><tr><th>Date</th><th>What</th><th style={{ textAlign: "right" }}>Credits</th></tr></thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td className="wr-nowrap">{DATE.format(new Date(entry.createdAt))}</td>
                    <td>
                      <span className="wr-ledger-what">
                        <span className="wr-ledger-icon" data-kind={entry.kind} data-job={entry.job ?? undefined} aria-hidden="true"><Icon name={iconFor(entry)} size={16} /></span>
                        <span>
                          <strong>{describe(entry)}</strong>
                          <span className="wr-small wr-muted">
                            {describe(entry) === KIND_LABEL[entry.kind] ? (entry.delta > 0 ? "Added to your balance" : "Taken from your balance") : KIND_LABEL[entry.kind]}<span className="wr-ledger-date"> · {DATE.format(new Date(entry.createdAt))}</span>{entry.expiresAt ? ` · Expires ${DATE.format(new Date(entry.expiresAt))}` : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="wr-ledger-amount" data-dir={entry.delta > 0 ? "in" : "out"}
                        aria-label={`${entry.delta > 0 ? "Added" : "Used"} ${count(Math.abs(entry.delta))} credits`}>
                        {entry.delta > 0 ? "+" : "−"}{count(Math.abs(entry.delta))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="wr-settings-card-body"><p className="wr-small wr-muted">Nothing yet. Purchases and AI work will show here.</p></div>
        )}
      </section>
    </>
  );
}
