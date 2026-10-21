import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { BachsError, createCheckout } from "../../../../lib/billing/bachs";
import { bachsConfig, billingEnabled, maxPurchase } from "../../../../lib/billing/config";
import { creditsFor } from "../../../../lib/billing/rates";
import { mayPayIn, pricingCurrency } from "../../../../lib/billing/region";
import { appUrl } from "../../../../lib/config";
import { sameOrigin, seeOther } from "../../../../lib/redirect";
import { createAdminClient, getSecretKey } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

// Buy credits (PRD BILL-2): creates a Bachs checkout for one pack and sends the member to Bachs' hosted page.
// POST from a form, never a link. Credits are added later by the webhook, never by coming back here.

const CREDITS_PAGE = "/app/settings/credits";

export async function POST(request: NextRequest) {
  if (!billingEnabled()) return new NextResponse("Not found", { status: 404 });
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });

  const back = (result: string) => seeOther(`${CREDITS_PAGE}?checkout=${result}`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return seeOther(`/login?next=${CREDITS_PAGE}`);

  const config = bachsConfig();
  if (!config || !getSecretKey()) {
    console.error("[billing] Set BACHS_API_KEY, BACHS_WEBHOOK_SECRET and SUPABASE_SECRET_KEY to sell credits.");
    return back("not_configured");
  }

  // Bachs sends the member back to these, and refuses localhost. Locally, run a tunnel and set APP_URL to it.
  const site = appUrl();
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(site)) {
    console.error(`[billing] Bachs needs public return URLs, but APP_URL is ${site}. Set APP_URL to a public address (locally, a tunnel such as cloudflared) and open the app there.`);
    return back("not_public");
  }

  const form = await request.formData();
  const packId = String(form.get("packId") ?? "");
  const admin = createAdminClient();
  const [{ data: pack }, { data: profile }] = await Promise.all([
    admin.from("credit_packs").select("id, credits, price_amount, currency, bachs_product_id, custom_amount, active").eq("id", packId).maybeSingle(),
    admin.from("profiles").select("email, account_status").eq("id", user.id).maybeSingle(),
  ]);
  if (!pack?.active) return back("unknown_pack");
  // Naira packs only from Nigeria (D-033): ?c=NG shows naira prices to anyone, but can't buy at our fixed rate from abroad.
  if (!mayPayIn(pack.currency, await pricingCurrency())) return back("naira_nigeria_only");
  if (profile?.account_status !== "active") return back("suspended");

  const price = Number(pack.price_amount);
  let amount = price;
  let credits = pack.credits;
  if (pack.custom_amount) {
    const chosen = Number(String(form.get("amount") ?? "").trim());
    if (!Number.isFinite(chosen) || chosen < price || chosen > maxPurchase(pack.currency)) return back("bad_amount");
    amount = Math.round(chosen * 100) / 100;
    credits = creditsFor(amount, price, pack.credits);
  }

  // The row exists before Bachs knows about the checkout, so a payment can never arrive for a checkout we
  // didn't record. Its Bachs id is filled in once Bachs answers.
  const reference = randomUUID();
  const { data: session, error } = await admin.from("checkout_sessions").insert({
    user_id: user.id, pack_id: pack.id, bachs_checkout_id: `pending:${reference}`, credits, amount, currency: pack.currency,
  }).select("id").single();
  if (error || !session) {
    console.error("[billing] Couldn't record the checkout:", error?.message);
    return back("error");
  }

  try {
    const checkout = await createCheckout(config, {
      amount: amount.toFixed(2),
      productId: pack.bachs_product_id,
      currency: pack.currency,
      email: profile.email ?? user.email ?? "",
      // Back through /api/billing/return, which asks Bachs whether this checkout was paid and credits it.
      successUrl: `${site}/api/billing/return?session=${session.id}`,
      cancelUrl: `${site}${CREDITS_PAGE}?checkout=cancelled`,
      reference,
      metadata: { checkout_session: session.id, user_id: user.id },
    });
    const { error: saved } = await admin.from("checkout_sessions").update({ bachs_checkout_id: checkout.checkoutId }).eq("id", session.id);
    if (saved) throw new Error(saved.message);
    return NextResponse.redirect(checkout.checkoutUrl, { status: 303 });
  } catch (failure) {
    console.error("[billing] Checkout failed:", failure instanceof BachsError ? `${failure.message} (HTTP ${failure.status ?? "no response"})` : failure);
    await admin.from("checkout_sessions").update({ status: "expired" }).eq("id", session.id);
    return back("error");
  }
}
