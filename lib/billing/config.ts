// Billing switches and constants (PRD BILL-1, D-022). Nothing here needs a Bachs variable unless billing is on.

/** BILLING_ENABLED turns billing on. When off, no billing route, page, webhook or credit check runs. */
export function billingEnabled() {
  return /^(1|true|yes|on)$/i.test(process.env.BILLING_ENABLED ?? "");
}

/** One credit is worth one US cent: a $5 pack is 500 credits before any bonus. */
export const CREDITS_PER_DOLLAR = 100;
/** The smallest purchase, in dollars. */
export const MIN_PURCHASE = 5;
/** The most one purchase can be, in dollars (or the same value in naira). */
export const MAX_PURCHASE = 1000;

/**
 * Naira prices (D-033): Nigerian visitors pay in naira at our own fixed rate, for exactly the credits the same
 * dollars buy. ₦3,000 is $2, so 200 credits; the smallest naira purchase is ₦3,000.
 */
export const NGN_PER_USD = 1500;
export const MIN_PURCHASE_NGN = 3000;

/** The cookie the site nav's ₦/$ switch sets: a two-letter country, NG or US. Display only (D-033). */
export const CURRENCY_COOKIE = "pricing_c";

/** Our rate from dollars to a currency packs are sold in. Unknown currencies count as dollars. */
export function perDollar(currency: string) {
  return currency.toUpperCase() === "NGN" ? NGN_PER_USD : 1;
}

/** The most one purchase can be, in `currency`. */
export function maxPurchase(currency: string) {
  return MAX_PURCHASE * perDollar(currency);
}

/** What `credits` are worth in `currency`: 200 credits are $2, or ₦3,000. */
export function creditValue(credits: number, currency: string) {
  return (credits / CREDITS_PER_DOLLAR) * perDollar(currency);
}

/** The smallest purchase in `currency`, for copy where packs aren't loaded (emails, the AI access page). */
export function minPurchase(currency: string) {
  return currency.toUpperCase() === "NGN" ? MIN_PURCHASE_NGN : MIN_PURCHASE;
}
/** Purchased and granted credits expire this many months after they arrive. */
export const CREDIT_EXPIRY_MONTHS = 3;

/** Free credits a member gets once, when they choose Poxeet credits. STARTER_CREDITS=0 turns them off. */
export function starterCredits() {
  const value = Number(process.env.STARTER_CREDITS ?? 50);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** When credits bought or granted at `from` expire. */
export function creditExpiry(from = new Date()) {
  const date = new Date(from);
  date.setMonth(date.getMonth() + CREDIT_EXPIRY_MONTHS);
  return date;
}

export type BachsConfig = { apiKey: string; webhookSecret: string; apiUrl: string };

/**
 * Bachs settings, or null when they're missing. A sk_sandbox_ key talks to the sandbox API unless BACHS_API_URL
 * says otherwise; a sk_live_ key talks to production.
 */
export function bachsConfig(): BachsConfig | null {
  const apiKey = process.env.BACHS_API_KEY;
  const webhookSecret = process.env.BACHS_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) return null;
  const apiUrl = process.env.BACHS_API_URL || (apiKey.startsWith("sk_live_") ? "https://api.bachs.io" : "https://sandbox-api.bachs.io");
  return { apiKey, webhookSecret, apiUrl: apiUrl.replace(/\/+$/, "") };
}
