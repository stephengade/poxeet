import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/marketing/site-footer";
import { SiteNav } from "../../components/marketing/site-nav";
import { APP_NAME } from "../../lib/config";
import { CREDIT_EXPIRY_MONTHS, MIN_PURCHASE, MIN_PURCHASE_NGN } from "../../lib/billing/config";
import { money } from "../../lib/billing/money";

export const metadata: Metadata = { title: `Terms · ${APP_NAME}` };

// The terms members agree to on the hosted instance. Credit wording follows D-022: no refunds, credits expire
// three months after they arrive. Self-hosted instances set their own terms.

export default function Terms() {
  return (
    <div className="theme-light showroom">
      <SiteNav />
      <main className="wrap terms">
      <h1 className="display display-sm">Terms</h1>
      <p className="terms-updated">Last updated 15 October 2026</p>

      <h2>Using {APP_NAME}</h2>
      <p>
        {APP_NAME} drafts LinkedIn posts in your voice and publishes only the posts you approve. You are responsible for what
        is published from your account. Don&apos;t use {APP_NAME} for anything unlawful, misleading or against LinkedIn&apos;s terms.
      </p>

      <h2>AI credits</h2>
      <p>
        You can pay for the AI that analyses your voice and writes your drafts in two ways: with your own key from an AI
        provider, billed by that provider, or with {APP_NAME} credits bought from us.
      </p>
      <ul>
        <li>One credit is worth US$0.01. Purchases start at US${MIN_PURCHASE}. Some packs include bonus credits.</li>
        <li>
          In Nigeria, prices are shown and charged in naira, from {money(MIN_PURCHASE_NGN, "NGN")}. Naira prices are set by us and may change; credits
          bought in naira work exactly like any others. Paying in naira is available only from Nigeria.
        </li>
        <li>AI work is charged in credits by the amount of text it reads and writes. The cost of each job is shown in Settings → Credits.</li>
        <li>Before a job runs, its largest possible cost is held from your balance; when it finishes, only what it used is charged and the rest is returned.</li>
        <li>Credits are added only once the payment provider, Bachs, confirms your payment.</li>
        <li>
          Credits expire {CREDIT_EXPIRY_MONTHS} months after they are added, whether bought or given free. Unused credits are
          removed when they expire and are not refunded. Older credits are used first.
        </li>
        <li>Credits have no cash value, can&apos;t be transferred to another account and are not a subscription; nothing renews.</li>
        <li>While your own key is saved, credits aren&apos;t used and still expire on their date.</li>
      </ul>

      <h2>Refunds</h2>
      <p>
        Credit purchases are final and not refundable, including unused or expired credits. If a payment is reversed
        (for example a chargeback, or a refund made in error), the credits it bought are removed from your balance; any
        that were already used are recorded against your account.
      </p>

      <h2>Your data</h2>
      <p>
        Your imported posts and brief are sent to the AI provider that runs your jobs. You can delete your data at any time
        from Settings. Deleting your account removes any remaining credits. Our <Link href="/privacy">Privacy policy</Link> explains
        what we collect and who processes it.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms and prices. Credits you already bought keep the expiry date they had when you bought them.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
