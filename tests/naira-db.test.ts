import { describe, expect, it } from "vitest";
import { CREDITS_PER_DOLLAR, NGN_PER_USD } from "../lib/billing/config";
import { admin, hasLocalSupabase } from "./helpers/local-supabase";

// The naira packs (202610210001_naira_packs.sql) against a local Supabase: every one gives exactly the credits the
// same dollars buy, bonus included, and the smallest is ₦3,000 (D-033).
describe.skipIf(!hasLocalSupabase)("naira packs", () => {
  it("price each pack at ₦1,500 to $1, from ₦3,000", async () => {
    const { data, error } = await admin().from("credit_packs").select("price_amount, credits, bonus_percent, custom_amount").eq("currency", "NGN").eq("active", true);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    for (const pack of data ?? []) {
      const price = Number(pack.price_amount);
      expect(pack.credits, `₦${price}`).toBe(Math.floor((price / NGN_PER_USD) * CREDITS_PER_DOLLAR * (1 + pack.bonus_percent / 100)));
    }
    expect(Math.min(...(data ?? []).map((pack) => Number(pack.price_amount)))).toBe(3000);
    expect((data ?? []).filter((pack) => pack.custom_amount)).toHaveLength(1);
  });
});
