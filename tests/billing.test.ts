import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiJobError, runAiJob, type AiAccess, type AiAccessResult, type AiJobDb } from "../lib/ai/server";
import { createCheckout, getCheckout, parseEvent, signatureHeader, verifyWebhook } from "../lib/billing/bachs";
import { billingEnabled, creditExpiry } from "../lib/billing/config";
import { costShare, creditRates, creditsFor, isLowBalance, jobCost, weeklyCost, weeksLeft } from "../lib/billing/rates";
import { confirmCheckout, handleBachsEvent, type RpcClient } from "../lib/billing/webhook";

// Billing without a network or a database: signatures, event handling, credit maths and the job runner.
// The SQL functions themselves (holds, settling, refunds, expiry) are tested in billing-db.test.ts.

const SECRET = "whsec_test_secret";
const NOW = 1_760_000_000_000;
const body = JSON.stringify({ id: "evt_1", type: "collection.succeeded", data: { checkout_id: "chk_1", charge_id: "ch_1", amount: "5.00", currency: "USD" } });

describe("verifyWebhook", () => {
  const at = Math.floor(NOW / 1000);

  it("accepts a correctly signed V2 header", () => {
    expect(verifyWebhook(body, { "x-bachs-signature-v2": signatureHeader(SECRET, body, at) }, SECRET, NOW)).toBe(true);
  });

  it("accepts the V1 header pair", () => {
    const v1 = signatureHeader(SECRET, body, at).split("v1=")[1];
    expect(verifyWebhook(body, new Headers({ "x-bachs-signature": v1, "x-bachs-timestamp": String(at) }), SECRET, NOW)).toBe(true);
  });

  it("accepts any matching v1 during a secret rotation", () => {
    const current = signatureHeader(SECRET, body, at).split("v1=")[1];
    const header = `t=${at},v1=${"ab".repeat(32)},v1=${current}`;
    expect(verifyWebhook(body, { "x-bachs-signature-v2": header }, SECRET, NOW)).toBe(true);
  });

  it("rejects a wrong secret, a changed body, a missing header and garbage", () => {
    const header = signatureHeader(SECRET, body, at);
    expect(verifyWebhook(body, { "x-bachs-signature-v2": signatureHeader("other", body, at) }, SECRET, NOW)).toBe(false);
    expect(verifyWebhook(body.replace("5.00", "500.00"), { "x-bachs-signature-v2": header }, SECRET, NOW)).toBe(false);
    expect(verifyWebhook(body, {}, SECRET, NOW)).toBe(false);
    expect(verifyWebhook(body, { "x-bachs-signature-v2": "t=abc,v1=zz" }, SECRET, NOW)).toBe(false);
  });

  it("rejects a replay signed more than 5 minutes ago", () => {
    const old = at - 301;
    expect(verifyWebhook(body, { "x-bachs-signature-v2": signatureHeader(SECRET, body, old) }, SECRET, NOW)).toBe(false);
    expect(verifyWebhook(body, { "x-bachs-signature-v2": signatureHeader(SECRET, body, at - 299) }, SECRET, NOW)).toBe(true);
  });

  it("parses only well-formed envelopes", () => {
    expect(parseEvent(body)?.id).toBe("evt_1");
    expect(parseEvent("{}")).toBeNull();
    expect(parseEvent("not json")).toBeNull();
  });
});

function fakeRpc(answer: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const db: RpcClient = { rpc: async (fn, args) => { calls.push({ fn, args }); return answer(fn, args); } };
  return { db, calls };
}

describe("handleBachsEvent", () => {
  const event = parseEvent(body)!;
  // Bachs says: a USD 5.00 checkout, paid (the buyer may have paid in NGN; the checkout's own amount is what counts).
  const paid = vi.fn(async (id: string) => ({ checkoutId: id, paid: true, amount: "5.00", currency: "USD", chargeId: "ch_1" }));

  it("reads the checkout from Bachs and credits its own amount through apply_payment, with a 3-month expiry", async () => {
    const { db, calls } = fakeRpc(() => ({ data: true, error: null }));
    expect(await handleBachsEvent(db, event, paid)).toEqual({ result: "credited", checkoutId: "chk_1" });
    expect(paid).toHaveBeenCalledWith("chk_1");
    expect(calls[0].fn).toBe("apply_payment");
    expect(calls[0].args).toMatchObject({ p_checkout_id: "chk_1", p_charge_id: "ch_1", p_event_id: "evt_1", p_paid_amount: "5.00", p_currency: "USD" });
    const expires = new Date(String(calls[0].args.p_expires_at)).getTime();
    expect(Math.abs(expires - creditExpiry().getTime())).toBeLessThan(5_000);
  });

  it("ignores the event's own amount and currency (a buyer paying in NGN)", async () => {
    const naira = parseEvent(JSON.stringify({ id: "evt_ngn", type: "collection.succeeded", data: { checkout_id: "chk_1", charge_id: "ch_1", amount: "14217.83", currency: "NGN" } }))!;
    const { db, calls } = fakeRpc(() => ({ data: true, error: null }));
    expect((await handleBachsEvent(db, naira, paid)).result).toBe("credited");
    expect(calls[0].args).toMatchObject({ p_paid_amount: "5.00", p_currency: "USD" });
  });

  it("reports a replayed delivery as a duplicate", async () => {
    const { db } = fakeRpc(() => ({ data: false, error: null }));
    expect(await handleBachsEvent(db, event, paid)).toEqual({ result: "duplicate" });
  });

  it("credits nothing while Bachs hasn't marked the checkout paid", async () => {
    const { db, calls } = fakeRpc(() => ({ data: true, error: null }));
    const open = vi.fn(async (id: string) => ({ checkoutId: id, paid: false, amount: "5.00", currency: "USD", chargeId: null }));
    expect(await handleBachsEvent(db, event, open)).toEqual({ result: "pending" });
    expect(calls).toHaveLength(0);
  });

  it("confirms on return the same way, once", async () => {
    let applied = false;
    const { db } = fakeRpc(() => { const first = !applied; applied = true; return { data: first, error: null }; });
    expect((await confirmCheckout(db, paid, "chk_1", "return:chk_1", "checkout.return")).result).toBe("credited");
    expect((await handleBachsEvent(db, event, paid)).result).toBe("duplicate");
  });

  it("ignores checkouts it didn't create and mismatched amounts, and throws on database errors so Bachs retries", async () => {
    expect((await handleBachsEvent(fakeRpc(() => ({ data: null, error: { message: "Unknown checkout.", code: "23503" } })).db, event, paid)).result).toBe("ignored");
    expect((await handleBachsEvent(fakeRpc(() => ({ data: null, error: { message: "short", code: "22023" } })).db, event, paid)).result).toBe("ignored");
    await expect(handleBachsEvent(fakeRpc(() => ({ data: null, error: { message: "connection reset" } })).db, event, paid)).rejects.toThrow(/apply_payment/);
  });

  it("claws back a paid refund through apply_refund", async () => {
    const { db, calls } = fakeRpc(() => ({ data: 300, error: null }));
    const refund = { id: "evt_2", type: "refund.paid", data: { refund_id: "rfnd_1", charge_id: "ch_1", refunded_amount: "3.00", status: "success" } };
    expect(await handleBachsEvent(db, refund, paid)).toEqual({ result: "refunded", chargeId: "ch_1", credits: 300 });
    expect(calls[0]).toEqual({ fn: "apply_refund", args: { p_charge_id: "ch_1", p_refund_id: "rfnd_1", p_event_id: "evt_2", p_event_type: "refund.paid", p_refunded_amount: 3 } });
    expect(await handleBachsEvent(fakeRpc(() => ({ data: null, error: null })).db, refund, paid)).toEqual({ result: "duplicate" });
  });

  it("ignores events it doesn't use, without touching Bachs or the database", async () => {
    const { db, calls } = fakeRpc(() => ({ data: null, error: null }));
    const lookup = vi.fn();
    expect((await handleBachsEvent(db, { id: "evt_3", type: "checkout.completed", data: {} }, lookup)).result).toBe("ignored");
    expect((await handleBachsEvent(db, { id: "evt_4", type: "collection.succeeded", data: { charge_id: "x" } }, lookup)).result).toBe("ignored");
    expect(calls).toHaveLength(0);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("getCheckout", () => {
  const config = { apiKey: "sk_sandbox_test", webhookSecret: SECRET, apiUrl: "https://sandbox-api.bachs.io" };

  it("reads status, the checkout's own amount and the payment id", async () => {
    const fetch = vi.fn(async () => Response.json({
      checkout_id: "chk_9", status: "completed", payment_status: "succeeded", amount: "10.00", currency: "USD",
      charge: { payment_id: "ch_9", amount_paid: "14217.83", currency: "NGN", status: "succeeded" },
    }));
    expect(await getCheckout(config, "chk_9", { fetch })).toEqual({ checkoutId: "chk_9", paid: true, amount: "10.00", currency: "USD", chargeId: "ch_9" });
  });

  it("is not paid until completed and succeeded", async () => {
    const fetch = vi.fn(async () => Response.json({ checkout_id: "chk_9", status: "open", payment_status: null, amount: "10.00", currency: "USD", charge: null }));
    expect((await getCheckout(config, "chk_9", { fetch })).paid).toBe(false);
  });
});

describe("credit maths", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("charges every model at Sonnet's list price x 6, in credits per million tokens (D-034)", () => {
    expect(creditRates()).toEqual({ input: 1200, output: 6000 });
  });

  it("follows CREDIT_MARGIN", () => {
    vi.stubEnv("CREDIT_MARGIN", "2");
    expect(creditRates()).toEqual({ input: 400, output: 2000 });
  });

  it("rounds a job's cost up to whole credits, with no float noise", () => {
    expect(jobCost({ inputTokens: 1_000_000, outputTokens: 0 })).toBe(1200);
    expect(jobCost({ inputTokens: 10_000, outputTokens: 2_000 })).toBe(24); // 12 + 12
    expect(jobCost({ inputTokens: 1, outputTokens: 0 })).toBe(1);
    expect(jobCost({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("estimates weeks of drafts and the low-balance line", () => {
    expect(weeklyCost()).toBe(135); // 50k x 1,200 + 12.5k x 6,000, per million
    expect(weeksLeft(270)).toBe(2);
    expect(weeksLeft(134)).toBe(0);
    expect(isLowBalance(134)).toBe(true);
    expect(isLowBalance(135)).toBe(false);
  });

  it("tells the admin what a cheaper model really costs, as a share of the billed price", () => {
    expect(costShare("deepseek-chat")).toBeCloseTo(30 / 225); // 30k of 225k dollar-tokens
    expect(costShare("claude-sonnet-5-5")).toBe(1);
    expect(costShare("claude-opus-5-5")).toBe(2);
    expect(costShare("some-new-model")).toBe(1);
    expect(costShare(null)).toBe(1);
  });

  it("buys credits at the pack's rate for any amount", () => {
    expect(creditsFor(5, 5, 500)).toBe(500);
    expect(creditsFor(12.34, 5, 500)).toBe(1234);
    expect(creditsFor(20, 20, 2100)).toBe(2100);
  });

  it("is off unless BILLING_ENABLED says otherwise", () => {
    vi.stubEnv("BILLING_ENABLED", "");
    expect(billingEnabled()).toBe(false);
    vi.stubEnv("BILLING_ENABLED", "true");
    expect(billingEnabled()).toBe(true);
  });

  it("expires credits three months after they arrive", () => {
    expect(creditExpiry(new Date("2026-10-15T12:00:00Z")).toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });
});

describe("createCheckout", () => {
  const config = { apiKey: "sk_sandbox_test", webhookSecret: SECRET, apiUrl: "https://sandbox-api.bachs.io" };

  it("charges the pack's amount without a Bachs product", async () => {
    let payload: Record<string, unknown> = {};
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({ checkout_id: "chk_1", checkout_url: "https://checkout.bachs.io/c/y" });
    });
    await createCheckout(config, { amount: "20.00", currency: "USD", email: "ann@example.com", successUrl: "s", cancelUrl: "c", reference: "r" }, { fetch });
    expect(payload.pricing).toEqual({ currency: "USD", amount: "20.00" });
    expect(payload).not.toHaveProperty("product_cart");
  });

  it("posts the product, the customer and our reference, and returns the hosted URL", async () => {
    let sent: { url: string; init?: RequestInit } | null = null;
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      sent = { url: String(url), init };
      return Response.json({ checkout_id: "chk_9", checkout_url: "https://checkout.bachs.io/c/x", status: "open" });
    });
    const checkout = await createCheckout(config, {
      productId: "prod_5", currency: "USD", email: "ann@example.com", successUrl: "https://a/s", cancelUrl: "https://a/c", reference: "ref-1", amount: "12.50",
    }, { fetch });
    expect(checkout).toEqual({ checkoutId: "chk_9", checkoutUrl: "https://checkout.bachs.io/c/x" });
    expect(sent!.url).toBe("https://sandbox-api.bachs.io/v1/checkout-sessions");
    expect(new Headers(sent!.init?.headers).get("authorization")).toBe("Bearer sk_sandbox_test");
    const payload = JSON.parse(String(sent!.init?.body));
    expect(payload.product_cart).toEqual([{ product_id: "prod_5", quantity: 1, pricing: { price_type: "fixed", amount: "12.50" } }]);
    expect(payload).toMatchObject({ customer: { email: "ann@example.com" }, reference: "ref-1", success_url: "https://a/s" });
  });

  it("throws with Bachs' error code, detail and field errors when it refuses", async () => {
    const fetch = vi.fn(async () => Response.json({
      detail: "success_url must be a publicly accessible URL (localhost is not allowed)", error_code: "VALIDATION_ERROR",
      errors: [{ field: "success_url", message: "not public" }],
    }, { status: 400 }));
    const request = { amount: "5.00", currency: "USD", email: "a@b.c", successUrl: "http://localhost:3000/s", cancelUrl: "c", reference: "r" };
    await expect(createCheckout(config, request, { fetch })).rejects.toThrow("VALIDATION_ERROR success_url must be a publicly accessible URL (localhost is not allowed) (success_url: not public)");
  });
});

describe("runAiJob", () => {
  const job = { job: "draft", maxInputTokens: 20_000, maxOutputTokens: 4_000 };
  const credits: AiAccess = { provider: "deepseek", apiKey: "sk-x", model: "deepseek-chat", source: "credits", jobId: "draft:1", held: 4 };
  let calls: Array<{ fn: string; args: Record<string, unknown> }>;
  let inserted: Array<Record<string, unknown>>;
  let db: AiJobDb;

  beforeEach(() => {
    calls = [];
    inserted = [];
    db = {
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        return { data: fn === "settle_credits" ? args.p_actual : 1000, error: null };
      },
      from: () => ({ insert: async (row) => { inserted.push(row); return { error: null }; } }),
    };
  });
  const resolveTo = (result: AiAccessResult) => vi.fn(async () => result);

  it("settles a credits job at its actual cost and records the tokens", async () => {
    const result = await runAiJob("user-1", job, async () => ({ value: "draft text", usage: { inputTokens: 10_000, outputTokens: 2_000 } }),
      { db, resolve: resolveTo({ ok: true, access: credits }) });
    expect(result).toEqual({ ok: true, value: "draft text", charged: 24 });
    expect(calls.find((call) => call.fn === "settle_credits")?.args).toEqual({ p_job_id: "draft:1", p_actual: 24 });
    expect(inserted[0]).toMatchObject({ user_id: "user-1", job: "draft", job_id: "draft:1", input_tokens: 10_000, output_tokens: 2_000, used_master_key: true, credits_charged: 24 });
  });

  it("releases the whole hold when the job fails before any usage", async () => {
    await expect(runAiJob("user-1", job, async () => { throw new Error("timeout"); }, { db, resolve: resolveTo({ ok: true, access: credits }) })).rejects.toThrow("timeout");
    expect(calls).toEqual([{ fn: "settle_credits", args: { p_job_id: "draft:1", p_actual: 0 } }]);
    expect(inserted).toHaveLength(0);
  });

  it("charges the usage a failed job reports", async () => {
    await expect(runAiJob("user-1", job, async () => { throw new AiJobError("bad schema", { inputTokens: 20_000, outputTokens: 0 }); },
      { db, resolve: resolveTo({ ok: true, access: credits }) })).rejects.toThrow("bad schema");
    expect(calls[0].args).toEqual({ p_job_id: "draft:1", p_actual: 24 });
    expect(inserted[0]).toMatchObject({ credits_charged: 24 });
  });

  it("never touches credits on the member's own key", async () => {
    const own: AiAccess = { ...credits, source: "own_key", jobId: null, held: 0 };
    const result = await runAiJob("user-1", job, async () => ({ value: 1, usage: { inputTokens: 5, outputTokens: 5 } }), { db, resolve: resolveTo({ ok: true, access: own }) });
    expect(result).toMatchObject({ ok: true, charged: 0 });
    expect(calls).toHaveLength(0);
    expect(inserted[0]).toMatchObject({ used_master_key: false, credits_charged: 0, job_id: null });
  });

  it("returns the block without running the work when the balance doesn't cover the job", async () => {
    const work = vi.fn();
    const result = await runAiJob("user-1", job, work, { db, resolve: resolveTo({ ok: false, reason: "no_credits", message: "Buy credits" }) });
    expect(result).toEqual({ ok: false, reason: "no_credits", message: "Buy credits" });
    expect(work).not.toHaveBeenCalled();
  });
});
