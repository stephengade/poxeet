import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, deleteUser, hasLocalSupabase, uniqueEmail } from "./helpers/local-supabase";

// The credit SQL functions (PRD BILL-3 to BILL-6, D-022) against a local Supabase: payments applied once,
// concurrent holds, double settles, refund clawback and expiry.
describe.skipIf(!hasLocalSupabase)("credit ledger functions", () => {
  let db: SupabaseClient;
  let userId: string;
  let packId: string;
  let email: string;
  const later = () => new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

  beforeAll(async () => {
    db = admin();
    // On the access list, so this works whether the instance is open or invite-only.
    email = uniqueEmail("credits");
    await db.from("allowlist").insert({ email });
    const { data, error } = await db.auth.admin.createUser({ email, password: `Test-${crypto.randomUUID()}`, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No user created.");
    userId = data.user.id;
    const pack = await db.from("credit_packs").insert({ name: "Test pack", credits: 500, price_amount: 5, currency: "USD", bachs_product_id: `prod_${crypto.randomUUID()}`, active: false }).select("id").single();
    packId = pack.data!.id;
  });

  beforeEach(async () => {
    await db.from("credit_ledger").delete().eq("user_id", userId);
    await db.from("checkout_sessions").delete().eq("user_id", userId);
  });

  afterAll(async () => {
    if (userId) await deleteUser(userId);
    if (email) await db.from("allowlist").delete().eq("email", email);
    if (packId) await db.from("credit_packs").delete().eq("id", packId);
  });

  const balance = async () => Number((await db.rpc("current_credits", { p_user: userId })).data);
  const grant = (amount: number, reference = crypto.randomUUID(), expiresAt: string | null = later()) =>
    db.rpc("grant_credits", { p_user: userId, p_amount: amount, p_reference: reference, p_note: null, p_expires_at: expiresAt });

  async function checkout(credits = 500, amount = 5) {
    const id = `chk_${crypto.randomUUID()}`;
    await db.from("checkout_sessions").insert({ user_id: userId, pack_id: packId, bachs_checkout_id: id, credits, amount, currency: "USD" });
    return id;
  }
  const pay = (checkoutId: string, eventId: string, amount = "5.00", chargeId = `ch_${checkoutId}`) =>
    db.rpc("apply_payment", { p_checkout_id: checkoutId, p_charge_id: chargeId, p_event_id: eventId, p_event_type: "collection.succeeded", p_paid_amount: amount, p_currency: "USD", p_expires_at: later() });

  it("credits a payment exactly once, however often the webhook is delivered", async () => {
    const id = await checkout();
    expect((await pay(id, "evt_a")).data).toBe(true);
    expect((await pay(id, "evt_a")).data).toBe(false); // replay of the same event
    expect((await pay(id, "evt_b")).data).toBe(false); // a second event for the same payment
    expect(await balance()).toBe(500);
    const { data: session } = await db.from("checkout_sessions").select("status, bachs_charge_id").eq("bachs_checkout_id", id).single();
    expect(session).toMatchObject({ status: "paid", bachs_charge_id: `ch_${id}` });
    const { data: entry } = await db.from("credit_ledger").select("expires_at").eq("reference", id).single();
    expect(entry!.expires_at).not.toBeNull();
  });

  it("refuses a payment that doesn't cover the checkout, or an unknown checkout", async () => {
    const id = await checkout();
    expect((await pay(id, "evt_short", "4.99")).error?.code).toBe("22023");
    expect((await pay("chk_nope", "evt_unknown")).error?.code).toBe("23503");
    expect(await balance()).toBe(0);
  });

  it("lets only one of two concurrent jobs hold credits when the balance covers one", async () => {
    await grant(100);
    const [first, second] = await Promise.all([
      db.rpc("reserve_credits", { p_user: userId, p_amount: 70, p_job_id: "job-1" }),
      db.rpc("reserve_credits", { p_user: userId, p_amount: 70, p_job_id: "job-2" }),
    ]);
    expect([first.data, second.data].sort()).toEqual([false, true]);
    expect(await balance()).toBe(30);
  });

  it("settles at the actual cost once, and never more than was held", async () => {
    await grant(100);
    await db.rpc("reserve_credits", { p_user: userId, p_amount: 40, p_job_id: "job-s" });
    expect((await db.rpc("settle_credits", { p_job_id: "job-s", p_actual: 12 })).data).toBe(12);
    expect((await db.rpc("settle_credits", { p_job_id: "job-s", p_actual: 12 })).data).toBe(0);
    expect(await balance()).toBe(88);

    await db.rpc("reserve_credits", { p_user: userId, p_amount: 10, p_job_id: "job-over" });
    expect((await db.rpc("settle_credits", { p_job_id: "job-over", p_actual: 999 })).data).toBe(10);
    expect(await balance()).toBe(78);
  });

  it("releases a failed job's hold in full, and stale holds after 30 minutes", async () => {
    await grant(50);
    await db.rpc("reserve_credits", { p_user: userId, p_amount: 20, p_job_id: "job-f" });
    expect(await balance()).toBe(30);
    await db.rpc("settle_credits", { p_job_id: "job-f", p_actual: 0 });
    expect(await balance()).toBe(50);

    await db.rpc("reserve_credits", { p_user: userId, p_amount: 20, p_job_id: "job-stale" });
    await db.from("credit_ledger").update({ created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() }).eq("reference", "job-stale");
    expect((await db.rpc("release_stale_holds", {})).data).toBeGreaterThanOrEqual(1);
    expect(await balance()).toBe(50);
  });

  it("claws a refund back down to zero, records the shortfall, and applies each refund once", async () => {
    const id = await checkout();
    await pay(id, "evt_paid");
    await db.rpc("reserve_credits", { p_user: userId, p_amount: 450, p_job_id: "job-big" });
    await db.rpc("settle_credits", { p_job_id: "job-big", p_actual: 450 });
    expect(await balance()).toBe(50);

    const refund = () => db.rpc("apply_refund", { p_charge_id: `ch_${id}`, p_refund_id: "rfnd_1", p_event_id: "evt_refund", p_event_type: "refund.paid", p_refunded_amount: 5 });
    expect((await refund()).data).toBe(50);
    expect((await refund()).data).toBeNull();
    expect(await balance()).toBe(0);
    const { data: session } = await db.from("checkout_sessions").select("status, refund_shortfall, refunded_amount").eq("bachs_checkout_id", id).single();
    expect(session).toMatchObject({ status: "refunded", refund_shortfall: 450 });
  });

  it("claws back a partial refund in proportion", async () => {
    const id = await checkout(1000, 10);
    await pay(id, "evt_paid_10", "10.00");
    const { data } = await db.rpc("apply_refund", { p_charge_id: `ch_${id}`, p_refund_id: "rfnd_half", p_event_id: "evt_half", p_event_type: "refund.paid", p_refunded_amount: 2.5 });
    expect(data).toBe(250);
    expect(await balance()).toBe(750);
  });

  it("expires what is left of a lot, oldest first, and never below zero", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    await grant(100, "old-lot", past);
    await grant(100, "new-lot", later());
    // 150 used before the old lot expired: first in, first out, so the old lot is used up and nothing expires.
    await db.from("credit_ledger").insert({ user_id: userId, delta: -150, kind: "usage", reference: "job-fifo" });
    expect(await balance()).toBe(50);

    await db.from("credit_ledger").delete().eq("user_id", userId);
    await grant(100, "old-lot-2", past);
    await grant(100, "new-lot-2", later());
    await db.from("credit_ledger").insert({ user_id: userId, delta: -30, kind: "usage", reference: "job-small" });
    expect(await balance()).toBe(100); // 70 left in the old lot expire
    expect(await balance()).toBe(100); // and only once
    const { data: expired } = await db.from("credit_ledger").select("delta").eq("user_id", userId).eq("kind", "expiry");
    expect(expired).toEqual([{ delta: -70 }]);
  });

  it("grants starter credits once per reference", async () => {
    expect((await grant(50, `starter:${userId}`)).data).toBe(true);
    expect((await grant(50, `starter:${userId}`)).data).toBe(false);
    expect(await balance()).toBe(50);
  });
});
