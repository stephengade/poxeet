import { after, NextResponse, type NextRequest } from "next/server";
import { getCheckout, parseEvent, verifyWebhook } from "../../../../lib/billing/bachs";
import { bachsConfig, billingEnabled } from "../../../../lib/billing/config";
import { sendPurchaseReceipt } from "../../../../lib/billing/credits";
import { handleBachsEvent, type RpcClient } from "../../../../lib/billing/webhook";
import { createAdminClient, getSecretKey } from "../../../../lib/supabase/admin";

// Bachs webhooks (PRD BILL-3, BILL-6). A signed collection.succeeded makes us read the checkout from Bachs and
// credit it once (lib/billing/webhook.ts); /api/billing/return does the same when the member comes back, so
// whichever is first credits and the other finds it done. Register <site>/api/billing/webhook in the Bachs dashboard.
// A 5xx makes Bachs retry (up to 5 attempts over about 80 minutes); a 4xx doesn't.

export async function POST(request: NextRequest) {
  if (!billingEnabled()) return new NextResponse("Not found", { status: 404 });
  const config = bachsConfig();
  if (!config || !getSecretKey()) {
    console.error("[billing] Webhook received, but BACHS_WEBHOOK_SECRET or SUPABASE_SECRET_KEY isn't set.");
    return new NextResponse("Not configured", { status: 503 });
  }

  // The signature covers the raw bytes, so read the body as text before any parsing.
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers, config.webhookSecret)) {
    // Bachs doesn't retry a 4xx, so say why here: usually a BACHS_WEBHOOK_SECRET from another endpoint or mode.
    const signed = request.headers.has("x-bachs-signature-v2") || request.headers.has("x-bachs-signature");
    console.warn(`[billing] Webhook refused: ${signed ? "signature doesn't match BACHS_WEBHOOK_SECRET, or it's over 5 minutes old" : "no Bachs signature headers"}.`);
    return new NextResponse("Bad signature", { status: 401 });
  }
  const event = parseEvent(raw);
  if (!event) return new NextResponse("Bad payload", { status: 400 });

  try {
    const outcome = await handleBachsEvent(createAdminClient() as unknown as RpcClient, event, (id) => getCheckout(config, id));
    if (outcome.result === "credited") after(() => sendPurchaseReceipt(outcome.checkoutId));
    // Not marked paid yet at Bachs: a 5xx makes Bachs deliver again later.
    if (outcome.result === "pending") return new NextResponse("Not paid yet", { status: 503 });
    if (outcome.result === "ignored") console.info(`[billing] Ignored ${event.type} ${event.id}: ${outcome.reason}`);
    return NextResponse.json({ received: true, result: outcome.result });
  } catch (error) {
    console.error(`[billing] Couldn't apply ${event.type} ${event.id}:`, error);
    return new NextResponse("Try again", { status: 500 });
  }
}
