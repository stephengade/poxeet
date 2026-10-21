import { appUrl } from "../config";
import { email } from "../email";
import { createAdminClient } from "../supabase/admin";
import { creditExpiry, minPurchase, starterCredits } from "./config";
import { money } from "./money";
import { currencyForTimezone } from "./region";
import { isLowBalance, weeksLeft } from "./rates";

// Server-only reads and writes of a member's credits, for the Credits page, setup and emails. Every write goes
// through the SQL functions in supabase/migrations (202610140001, 202610150005), never straight to the ledger.

export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  bonusPercent: number;
  customAmount: boolean;
};

/** Active packs, in display order. */
export async function listPacks(): Promise<CreditPack[]> {
  const { data, error } = await createAdminClient()
    .from("credit_packs").select("id, name, credits, price_amount, currency, bonus_percent, custom_amount")
    .eq("active", true).order("sort").order("price_amount");
  if (error) throw new Error(`Couldn't read credit packs: ${error.message}`);
  return (data ?? []).map((pack) => ({
    id: pack.id, name: pack.name, credits: pack.credits, price: Number(pack.price_amount), currency: pack.currency,
    bonusPercent: pack.bonus_percent, customAmount: pack.custom_amount,
  }));
}

/** The balance after any due expiry. */
export async function currentCredits(userId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("current_credits", { p_user: userId });
  if (error) throw new Error(`Couldn't read the balance: ${error.message}`);
  return Number(data ?? 0);
}

export type LedgerKind = "purchase" | "grant" | "usage" | "refund" | "adjustment" | "expiry";
export type HistoryEntry = { id: number; kind: LedgerKind; delta: number; note: string | null; createdAt: string; expiresAt: string | null; job: string | null };

/**
 * What a member sees in their history: purchases, grants, usage per job, refunds, adjustments and expiries.
 * Holds and releases are bookkeeping for jobs in flight and are left out; so are zero entries.
 */
export async function creditHistory(userId: string, limit = 50): Promise<HistoryEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("credit_ledger")
    .select("id, kind, delta, note, reference, created_at, expires_at")
    .eq("user_id", userId).not("kind", "in", "(hold,release)").neq("delta", 0)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) throw new Error(`Couldn't read credit history: ${error.message}`);
  const jobIds = (data ?? []).filter((row) => row.kind === "usage").map((row) => row.reference);
  const jobs = new Map<string, string>();
  if (jobIds.length) {
    const { data: usage } = await admin.from("generation_usage").select("job_id, job").in("job_id", jobIds);
    for (const row of usage ?? []) if (row.job_id) jobs.set(row.job_id, row.job);
  }
  return (data ?? []).map((row) => ({
    id: row.id, kind: row.kind as LedgerKind, delta: row.delta, note: row.note, createdAt: row.created_at,
    expiresAt: row.expires_at, job: row.kind === "usage" ? jobs.get(row.reference) ?? null : null,
  }));
}

/** When the soonest still-unexpired purchase or grant runs out, or null. */
export async function nextExpiry(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("credit_ledger").select("expires_at")
    .eq("user_id", userId).in("kind", ["purchase", "grant"]).gt("expires_at", new Date().toISOString())
    .order("expires_at").limit(1).maybeSingle();
  return data?.expires_at ?? null;
}

/** Whether the member ever had credits: a purchase or a grant, starter credits included. */
export async function hasEverHadCredits(userId: string) {
  const { count } = await createAdminClient().from("credit_ledger").select("id", { count: "exact", head: true })
    .eq("user_id", userId).in("kind", ["purchase", "grant"]);
  return (count ?? 0) > 0;
}

/** The one-time free credits. Safe to call again: the reference makes it happen once per member. */
export async function grantStarterCredits(userId: string): Promise<boolean> {
  const amount = starterCredits();
  if (!amount) return false;
  const { data, error } = await createAdminClient().rpc("grant_credits", {
    p_user: userId, p_amount: amount, p_reference: `starter:${userId}`, p_note: "Starter credits", p_expires_at: creditExpiry().toISOString(),
  });
  if (error) throw new Error(`Couldn't grant starter credits: ${error.message}`);
  return data === true;
}

/** "₦3,000" for members on Lagos time, "$5" for everyone else: an email has no request to read a country from. */
function smallestTopUp(timezone: string | null) {
  const currency = currencyForTimezone(timezone);
  return money(minPurchase(currency), currency);
}

async function recipient(userId: string) {
  const { data } = await createAdminClient().from("profiles").select("email, first_name, timezone").eq("id", userId).maybeSingle();
  return data;
}

/** The receipt for a paid checkout. A failure is logged, never thrown: the credits are already in. */
export async function sendPurchaseReceipt(checkoutId: string) {
  try {
    const admin = createAdminClient();
    const { data: session } = await admin.from("checkout_sessions").select("user_id, credits, amount, currency, paid_at, bachs_charge_id")
      .eq("bachs_checkout_id", checkoutId).maybeSingle();
    if (!session) return;
    const person = await recipient(session.user_id);
    if (!person?.email) return;
    const balance = await currentCredits(session.user_id);
    const result = await email.sendSingle({
      to: person.email,
      template: "creditsReceipt",
      reference: `receipt:${checkoutId}`,
      data: {
        firstName: person.first_name, credits: session.credits, amount: Number(session.amount), currency: session.currency,
        paidAt: new Date(session.paid_at ?? Date.now()), receiptId: session.bachs_charge_id ?? checkoutId,
        balance, weeksLeft: weeksLeft(balance), expiresAt: creditExpiry(new Date(session.paid_at ?? Date.now())),
      },
    });
    if (!result.ok) console.error("[billing] Receipt email failed:", result.error);
  } catch (error) {
    console.error("[billing] Receipt email failed:", error);
  }
}

/**
 * Emails a member once when their balance drops below about a week of drafts. The dedupe key is their latest
 * purchase or grant, so the next warning comes only after they top up and run low again.
 */
export async function warnIfLowBalance(userId: string, balance: number) {
  if (!isLowBalance(balance)) return;
  try {
    const admin = createAdminClient();
    const { data: last } = await admin.from("credit_ledger").select("id").eq("user_id", userId)
      .in("kind", ["purchase", "grant"]).order("id", { ascending: false }).limit(1).maybeSingle();
    if (!last) return;
    const { error: claimed } = await admin.from("notifications").insert({ user_id: userId, kind: "credits_low", dedupe_key: `lot:${last.id}` });
    if (claimed) return; // already sent for this top-up (unique violation) or the insert failed
    const person = await recipient(userId);
    if (!person?.email) return;
    const result = await email.sendSingle({
      to: person.email, template: "creditsLow", reference: `credits-low:${last.id}`,
      data: { firstName: person.first_name, balance, buyUrl: `${appUrl()}/app/settings/credits?buy=1`, from: smallestTopUp(person.timezone) },
    });
    if (!result.ok) console.error("[billing] Low-balance email failed:", result.error);
  } catch (error) {
    console.error("[billing] Low-balance email failed:", error);
  }
}
