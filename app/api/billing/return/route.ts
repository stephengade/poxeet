import { after, NextResponse, type NextRequest } from "next/server";
import { getCheckout } from "../../../../lib/billing/bachs";
import { bachsConfig, billingEnabled } from "../../../../lib/billing/config";
import { sendPurchaseReceipt } from "../../../../lib/billing/credits";
import { confirmCheckout, type RpcClient } from "../../../../lib/billing/webhook";
import { seeOther } from "../../../../lib/redirect";
import { createAdminClient, getSecretKey } from "../../../../lib/supabase/admin";

// Where Bachs sends the member after paying (the checkout's success_url). Like Paystack's verify step: the
// redirect itself proves nothing, so this asks Bachs for the checkout, server to server, and credits it once if
// it's paid. The webhook does the same, so whichever comes first credits it. No session needed: the checkout id
// is unguessable, and only Bachs' answer can add credits, always to the member who started the checkout.

const CREDITS_PAGE = "/app/settings/credits";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  if (!billingEnabled()) return new NextResponse("Not found", { status: 404 });
  const sessionId = request.nextUrl.searchParams.get("session") ?? "";
  // The Credits page shows this checkout's real status (and keeps checking while it's pending).
  const back = (result: "paid" | "pending" | "error") =>
    seeOther(`${CREDITS_PAGE}?checkout=${result}${UUID.test(sessionId) ? `&session=${sessionId}` : ""}`);
  const config = bachsConfig();
  if (!config || !getSecretKey() || !UUID.test(sessionId)) return back("pending");

  const admin = createAdminClient();
  const { data: session } = await admin.from("checkout_sessions").select("bachs_checkout_id, status").eq("id", sessionId).maybeSingle();
  if (!session || session.bachs_checkout_id.startsWith("pending:")) return back("error");
  if (session.status === "paid") return back("paid");

  try {
    const checkoutId = session.bachs_checkout_id;
    const outcome = await confirmCheckout(admin as unknown as RpcClient, (id) => getCheckout(config, id), checkoutId, `return:${checkoutId}`, "checkout.return");
    if (outcome.result === "credited") after(() => sendPurchaseReceipt(checkoutId));
    if (outcome.result === "credited" || outcome.result === "duplicate") return back("paid");
    if (outcome.result === "ignored") console.warn(`[billing] Return for ${checkoutId} not credited: ${outcome.reason}`);
    // Not paid yet (a bank transfer still settling): the Credits page keeps checking, and the webhook credits it too.
    return back("pending");
  } catch (error) {
    console.error("[billing] Couldn't confirm the checkout on return:", error);
    return back("pending");
  }
}
