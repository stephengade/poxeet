"use server";

import { revalidatePath } from "next/cache";
import { getCheckout } from "../../../../../lib/billing/bachs";
import { bachsConfig, billingEnabled } from "../../../../../lib/billing/config";
import { sendPurchaseReceipt } from "../../../../../lib/billing/credits";
import { confirmCheckout, type RpcClient } from "../../../../../lib/billing/webhook";
import { createAdminClient, getSecretKey } from "../../../../../lib/supabase/admin";
import { createClient } from "../../../../../lib/supabase/server";

export type PurchaseStatus = { status: "paid"; credits: number } | { status: "pending" } | { status: "unknown" };

/**
 * Checks one of the signed-in member's own checkouts with Bachs and credits it if it's now paid (the same check
 * as /api/billing/return and the webhook; each checkout is credited once). Used while the Credits page waits.
 */
export async function checkPurchase(sessionId: string): Promise<PurchaseStatus> {
  if (!billingEnabled() || !getSecretKey()) return { status: "unknown" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "unknown" };
  const admin = createAdminClient();
  const { data: session } = await admin.from("checkout_sessions").select("bachs_checkout_id, status, credits")
    .eq("id", sessionId).eq("user_id", user.id).maybeSingle();
  if (!session) return { status: "unknown" };
  if (session.status === "paid") return { status: "paid", credits: session.credits };
  const config = bachsConfig();
  if (!config || session.bachs_checkout_id.startsWith("pending:")) return { status: "pending" };
  try {
    const checkoutId = session.bachs_checkout_id;
    const outcome = await confirmCheckout(admin as unknown as RpcClient, (id) => getCheckout(config, id), checkoutId, `return:${checkoutId}`, "checkout.return");
    if (outcome.result === "credited") await sendPurchaseReceipt(checkoutId);
    if (outcome.result === "credited" || outcome.result === "duplicate") {
      revalidatePath("/app", "layout");
      return { status: "paid", credits: session.credits };
    }
  } catch (error) {
    console.error("[billing] Couldn't check the purchase:", error);
  }
  return { status: "pending" };
}
