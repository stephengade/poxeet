import { notFound } from "next/navigation";
import { PurchasesView } from "../../../../components/admin/purchases-view";
import { billingEnabled } from "../../../../lib/billing/config";
import { loadEarnings, requestTime, requireAdmin } from "../../../../lib/admin/server";

export const instant = false;

// Exists only when billing is on: with it off there's nothing to buy.
export default async function AdminPurchasesPage() {
  const actor = await requireAdmin();
  if (!billingEnabled()) notFound();
  const earnings = await loadEarnings(30);
  return <PurchasesView earnings={earnings} base="/admin" timeZone={actor.timezone} now={requestTime()} />;
}
