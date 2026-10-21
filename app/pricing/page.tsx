import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";
import { publicPacks } from "../../components/marketing/hosted-pricing";
import { CurrencyCorner, NavCurrency } from "../../components/marketing/currency-corner";
import { SiteFooter } from "../../components/marketing/site-footer";
import { SiteNav } from "../../components/marketing/site-nav";
import { Button } from "../../components/ui";
import { creditsAvailable } from "../../lib/ai/server";
import { CREDIT_EXPIRY_MONTHS, creditValue, MIN_PURCHASE, MIN_PURCHASE_NGN, starterCredits } from "../../lib/billing/config";
import { money } from "../../lib/billing/money";
import { displayCurrency, packsIn, pricingCurrency } from "../../lib/billing/region";
import { creditRates, JOB_ESTIMATES, jobCost, weeklyCost } from "../../lib/billing/rates";
import { APP_NAME } from "../../lib/config";

export const metadata: Metadata = {
  title: `Pricing · ${APP_NAME}`,
  description: `${APP_NAME} is free with your own AI key, or pay as you go with credits from ${money(MIN_PURCHASE_NGN, "NGN")} or ${money(MIN_PURCHASE)}. No subscription.`,
};

// The public pricing page (D-022). Every number comes from credit_packs and lib/billing/rates.ts, so it can't
// drift from what members are charged. Cached for an hour; prices show in naira for Nigerian visitors (D-033),
// so the plans and costs render per request inside Suspense.

const count = (value: number) => value.toLocaleString("en-US");
/** "≈ 3 weeks", "≈ 1 week", or "Under a week" for a pack that doesn't cover one. */
const weeksLabel = (credits: number, weekly: number) => {
  const weeks = Math.floor(credits / Math.max(1, weekly));
  return weeks < 1 ? "Under a week" : `≈ ${count(weeks)} ${weeks === 1 ? "week" : "weeks"}`;
};

async function pricing() {
  "use cache";
  cacheLife("hours");
  const packs = await publicPacks();
  // Which model the shared key runs on is never shown (D-034); only whether credits can be used at all.
  return {
    packs,
    available: creditsAvailable(),
    rates: creditRates(),
    weekly: weeklyCost(),
    jobs: JOB_ESTIMATES.map((job) => ({ ...job, credits: Math.max(1, jobCost(job.usage)) })),
    starter: starterCredits(),
  };
}

const HEAD = (
  <header className="section-head section-head-center pricing-head">
    <span className="eyebrow">Pricing</span>
    <h1 className="display">Pay for the AI, <em>not a subscription.</em></h1>
    <p className="lede">{APP_NAME} itself is free. The only cost is the AI that learns your voice and writes your drafts: bring your own key, or buy credits as you go.</p>
  </header>
);

export default function Pricing({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  return (
    <div className="theme-light showroom">
      <SiteNav currency={<NavCurrency />} />
      <CurrencyCorner />
      <Suspense fallback={<main className="wrap pricing">{HEAD}</main>}><PricingMain searchParams={searchParams} /></Suspense>
      <SiteFooter />
    </div>
  );
}

async function PricingMain({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const { c } = await searchParams;
  const [{ packs: allPacks, available, rates, weekly, jobs, starter }, currency, visitor] = await Promise.all([pricing(), displayCurrency(c), pricingCurrency()]);
  const packs = packsIn(allPacks, currency);
  const shown = packs[0]?.currency ?? currency;
  const selling = packs.length > 0;
  const fixed = packs.filter((pack) => !pack.customAmount);
  const custom = packs.find((pack) => pack.customAmount);

  return (
      <main className="wrap pricing">
        {HEAD}
        {shown === "NGN" && visitor !== "NGN" && (
          <p className="pricing-note pricing-currency-note">Paying in naira is available from Nigeria. Elsewhere, checkout is in dollars.</p>
        )}

        <div className="plans">
          <section className="plan plan-light" aria-labelledby="own-key">
            <h2 id="own-key" className="pricing-plan-title">Your own AI key</h2>
            <span className="plan-price">{money(0, shown)}</span>
            <p>Paste a key from Claude, OpenAI or DeepSeek. Your provider bills you directly for what you use; {APP_NAME} charges nothing.</p>
            <ul>
              <li>Every feature, no limits from us</li>
              <li>Your key is stored encrypted and only its last 4 characters are ever shown</li>
              <li>Switch to credits, or back, at any time</li>
            </ul>
            <Button href="/signup" size="lg" variant="secondary">Get started</Button>
          </section>

          <section className="plan plan-light" aria-labelledby="credits">
            <h2 id="credits" className="pricing-plan-title">{APP_NAME} credits</h2>
            <span className="plan-price">{selling ? `From ${money(Math.min(...packs.map((pack) => pack.price)), shown)}` : "Coming soon"}</span>
            <p>
              No key needed: AI runs on our account and you pay as you go. 1 credit is {money(creditValue(1, shown), shown)}.
              {starter > 0 && selling ? ` New accounts get ${starter} free credits to try it.` : ""}
            </p>
            {selling ? (
              <ul>
                {fixed.map((pack) => (
                  <li key={pack.id} className="pricing-pack">
                    <strong>{money(pack.price, pack.currency)}</strong>
                    <span>{count(pack.credits)} credits{pack.bonusPercent > 0 ? ` · +${pack.bonusPercent}% bonus` : ""}</span>
                    <span className="pricing-weeks">{weeksLabel(pack.credits, weekly)}</span>
                  </li>
                ))}
                {custom && <li>Or any amount from {money(custom.price, custom.currency)}</li>}
              </ul>
            ) : (
              <ul><li>One-time credit packs from {shown === "NGN" ? money(MIN_PURCHASE_NGN, "NGN") : money(MIN_PURCHASE)}, no subscription</li><li>Secure checkout through Bachs</li></ul>
            )}
            <Button href="/signup" size="lg">Create an account</Button>
          </section>
        </div>

        {available && (
          <section className="pricing-section" aria-labelledby="costs">
            <h2 id="costs" className="display display-sm">What things <em>cost.</em></h2>
            <p className="lede">Credits are charged by how much text the AI reads and writes, so you pay for what each job really used. Typical costs:</p>
            <div className="pricing-table-wrap">
              <table className="pricing-table">
                <thead><tr><th>Job</th><th>Credits</th><th>About</th></tr></thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.job}><td>{job.label}</td><td>{count(job.credits)}</td><td>{money(creditValue(job.credits, shown), shown)}</td></tr>
                  ))}
                  <tr className="pricing-total"><td>A typical week: drafts, a few rewrites, the odd voice update</td><td>{count(weekly)}</td><td>{money(creditValue(weekly, shown), shown)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="pricing-note">
              Exact rate: {count(rates.input)} credits per million tokens (word pieces) read and {count(rates.output)} per million written. These are estimates;
              your Credits page shows the real cost of every job.
            </p>
          </section>
        )}

        <section className="pricing-section" aria-labelledby="how">
          <h2 id="how" className="display display-sm">How credits <em>work.</em></h2>
          <ul className="pricing-facts">
            <li><strong>Pay once, no subscription.</strong> Buy a pack when you need one. Nothing renews.</li>
            <li><strong>You&apos;re only charged for what&apos;s used.</strong> Before a job runs we set aside the most it could cost, then charge the actual cost and return the rest.</li>
            <li><strong>Credits expire after {CREDIT_EXPIRY_MONTHS} months.</strong> Your oldest credits are used first, and you&apos;ll see each expiry date in Settings.</li>
            <li><strong>Purchases are final.</strong> Unused or expired credits aren&apos;t refunded.</li>
            <li><strong>Secure checkout.</strong> Payments go through Bachs; card details never reach {APP_NAME}.</li>
            <li><strong>Your own key comes first.</strong> While a key is saved, credits aren&apos;t used.</li>
          </ul>
          <p className="pricing-note">The full wording is in the <Link href="/terms">Terms</Link>.</p>
        </section>
      </main>
  );
}
