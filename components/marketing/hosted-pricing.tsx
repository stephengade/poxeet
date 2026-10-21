import { cacheLife } from "next/cache";
import Link from "next/link";
import { billingEnabled, CREDIT_EXPIRY_MONTHS, creditValue } from "../../lib/billing/config";
import { listPacks, type CreditPack } from "../../lib/billing/credits";
import { money } from "../../lib/billing/money";
import { displayCurrency, packsIn } from "../../lib/billing/region";
import { getSecretKey } from "../../lib/supabase/admin";

// The hosted plan's price on the landing page. With billing on it lists the credit packs from credit_packs
// (never hard-coded prices); otherwise the hosted plan is "Coming soon". Packs are cached for an hour; which
// currency shows (naira in Nigeria, D-033) is decided per request.

/** Active packs for public pages, or none when billing is off. */
export async function publicPacks(): Promise<CreditPack[]> {
  "use cache";
  cacheLife("hours");
  if (!billingEnabled() || !getSecretKey()) return [];
  try {
    return await listPacks();
  } catch (error) {
    console.error("[billing] Landing page packs:", error);
    return [];
  }
}

export function HostedPricingFallback() {
  return (
    <>
      <span className="plan-price">Coming soon</span>
      <p>Sign up with your email and start today.</p>
      <ul>
        <li>Bring your own Claude key, or buy AI credits</li>
        <li>One-time credit packs, no subscription</li>
        <li>Secure checkout through Bachs</li>
        <li>Delete your data any time</li>
      </ul>
    </>
  );
}

/** `?c=NG` shows naira to anyone, as on /pricing (display only, D-033). */
export async function HostedPricing({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const { c } = await searchParams;
  const [all, currency] = await Promise.all([publicPacks(), displayCurrency(c)]);
  const list = packsIn(all, currency);
  if (!list.length) return <HostedPricingFallback />;
  const lowest = list.reduce((min, pack) => (pack.price < min.price ? pack : min), list[0]);
  const fixed = list.filter((pack) => !pack.customAmount);
  const custom = list.find((pack) => pack.customAmount);
  return (
    <>
      <span className="plan-price">From {money(lowest.price, lowest.currency)}</span>
      <p>Bring your own AI key for free, or buy credits as you go. 1 credit is {money(creditValue(1, lowest.currency), lowest.currency)}.</p>
      <ul>
        {fixed.map((pack) => (
          <li key={pack.id}>
            {money(pack.price, pack.currency)} for {pack.credits.toLocaleString("en-US")} credits{pack.bonusPercent > 0 ? ` (+${pack.bonusPercent}% bonus)` : ""}
          </li>
        ))}
        {custom && <li>Or any amount from {money(custom.price, custom.currency)}</li>}
        <li>No subscription. Credits expire after {CREDIT_EXPIRY_MONTHS} months. <Link href={currency === "NGN" ? "/pricing?c=NG" : "/pricing"}>See full pricing</Link></li>
      </ul>
    </>
  );
}
