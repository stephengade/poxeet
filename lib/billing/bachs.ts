import { createHmac, timingSafeEqual } from "node:crypto";
import type { BachsConfig } from "./config";

// Bachs, the payment provider (https://docs.bachs.io). Server only. Two things are used: creating a hosted
// checkout session, and verifying webhook signatures. Everything else (packs, credits) lives in our database.

const TIMEOUT_MS = 15_000;
/** Deliveries signed more than 5 minutes from now are refused, so a captured webhook can't be replayed later. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

type Options = { fetch?: typeof fetch };

export type CheckoutRequest = {
  /** What the member pays, in `currency`, as a decimal string ("10.00"). */
  amount: string;
  /** Optional: a Bachs product to show at checkout, priced at `amount`. Without one, checkout charges the amount alone. */
  productId?: string | null;
  currency: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
  /** Our reference for this purchase, unique per organisation. */
  reference: string;
  metadata?: Record<string, string>;
};

export type Checkout = { checkoutId: string; checkoutUrl: string };

export class BachsError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
  }
}

/** Bachs' error body (https://docs.bachs.io/errors): a flat object, with field details on validation errors. */
type BachsErrorBody = { detail?: string; error_code?: string; errors?: Array<{ field?: string; message?: string }> };

function bachsError(status: number, body: BachsErrorBody | null) {
  const fields = (body?.errors ?? []).map((error) => `${error.field ?? "?"}: ${error.message ?? "invalid"}`).join("; ");
  const message = [body?.error_code, body?.detail ?? `Bachs answered ${status}.`, fields && `(${fields})`].filter(Boolean).join(" ");
  return new BachsError(message, status, body?.error_code);
}

/**
 * Creates a hosted checkout session (POST /v1/checkout-sessions) and returns where to send the member. Prices
 * come from our credit_packs, so no Bachs product is needed: Bachs takes either `pricing` or a `product_cart`.
 */
export async function createCheckout(config: BachsConfig, request: CheckoutRequest, options: Options = {}): Promise<Checkout> {
  const price = request.productId
    ? { product_cart: [{ product_id: request.productId, quantity: 1, pricing: { price_type: "fixed", amount: request.amount } }] }
    : { pricing: { currency: request.currency, amount: request.amount } };
  const body = {
    ...price,
    customer: { email: request.email },
    billing_currency: request.currency,
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    reference: request.reference,
    metadata: request.metadata ?? {},
    expires_in_minutes: 60,
  };
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`${config.apiUrl}/v1/checkout-sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new BachsError("We couldn't reach the payment provider.");
  }
  const json = (await response.json().catch(() => null)) as BachsErrorBody & { checkout_id?: string; checkout_url?: string } | null;
  if (!response.ok || !json?.checkout_id || !json.checkout_url) throw bachsError(response.status, json);
  return { checkoutId: json.checkout_id, checkoutUrl: json.checkout_url };
}

/** What Bachs says about one checkout. Amount and currency are the checkout's own (what we asked for), not the
 *  currency the buyer happened to pay in. */
export type CheckoutState = {
  checkoutId: string;
  /** Completed and the payment succeeded. */
  paid: boolean;
  amount: string;
  currency: string;
  /** The payment's id (ch_...), which refund events refer to. */
  chargeId: string | null;
};

/** Reads a checkout (GET /v1/checkout-sessions/{id}): the server-side check that a payment really happened. */
export async function getCheckout(config: BachsConfig, checkoutId: string, options: Options = {}): Promise<CheckoutState> {
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`${config.apiUrl}/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`, {
      headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new BachsError("We couldn't reach the payment provider.");
  }
  type Body = BachsErrorBody & {
    checkout_id?: string; status?: string; payment_status?: string; amount?: string; currency?: string;
    charge?: { payment_id?: string; status?: string } | null;
  };
  const json = (await response.json().catch(() => null)) as Body | null;
  if (!response.ok || !json?.checkout_id || !json.amount || !json.currency) throw bachsError(response.status, json);
  return {
    checkoutId: json.checkout_id,
    paid: json.status === "completed" && json.payment_status === "succeeded",
    amount: json.amount,
    currency: json.currency,
    chargeId: json.charge?.payment_id ?? null,
  };
}

function sign(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

function sameHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

type HeaderSource = Headers | Record<string, string | undefined>;

function header(headers: HeaderSource, name: string) {
  return headers instanceof Headers ? headers.get(name) ?? undefined : headers[name] ?? headers[name.toLowerCase()];
}

/**
 * Checks a webhook delivery: HMAC-SHA256 over "{timestamp}.{raw body}", hex. Reads X-Bachs-Signature-V2
 * ("t=..,v1=..", any v1 may match, as during secret rotation) and falls back to X-Bachs-Signature with
 * X-Bachs-Timestamp. The body must be the raw bytes as received, before any JSON parsing.
 */
export function verifyWebhook(rawBody: string, headers: HeaderSource, secret: string, now = Date.now()): boolean {
  let timestamp: string | undefined;
  let signatures: string[] = [];
  const v2 = header(headers, "x-bachs-signature-v2");
  if (v2) {
    for (const part of v2.split(",")) {
      const [key, value] = part.trim().split("=", 2);
      if (key === "t") timestamp = value;
      if (key === "v1" && value) signatures.push(value);
    }
  } else {
    timestamp = header(headers, "x-bachs-timestamp");
    const v1 = header(headers, "x-bachs-signature");
    signatures = v1 ? [v1.trim()] : [];
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = sign(secret, timestamp, rawBody);
  return signatures.some((signature) => sameHex(signature, expected));
}

/** For tests and local tools: the V2 header Bachs would send for a body. */
export function signatureHeader(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${sign(secret, String(timestamp), rawBody)}`;
}

export type BachsEvent = { id: string; type: string; created_at?: string; data: Record<string, unknown> };

/** The envelope of a verified delivery, or null when it isn't one. */
export function parseEvent(rawBody: string): BachsEvent | null {
  try {
    const event = JSON.parse(rawBody) as Partial<BachsEvent>;
    if (typeof event.id !== "string" || typeof event.type !== "string" || !event.data || typeof event.data !== "object") return null;
    return event as BachsEvent;
  } catch {
    return null;
  }
}
