import { describe, expect, it, vi } from "vitest";

// No request in a unit test: no country header, and the switch's cookie is whatever `saved` holds.
let saved: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: (name: string) => (name === "pricing_c" && saved ? { name, value: saved } : undefined) }),
}));
import { creditValue, maxPurchase, minPurchase, NGN_PER_USD } from "../lib/billing/config";
import type { CreditPack } from "../lib/billing/credits";
import { money } from "../lib/billing/money";
import { creditsFor } from "../lib/billing/rates";
import { countryFrom, currencyForCountry, currencyForTimezone, displayCurrency, mayPayIn, packsIn } from "../lib/billing/region";

// Naira prices (D-033): same credits as the same dollars, at ₦1,500 to $1.

const pack = (currency: string, price: number, credits: number, customAmount = false): CreditPack =>
  ({ id: `${currency}-${price}`, name: `${credits} credits`, credits, price, currency, bonusPercent: 0, customAmount });

describe("naira prices", () => {
  it("buys exactly what the same dollars buy", () => {
    expect(NGN_PER_USD).toBe(1500);
    expect(creditValue(200, "NGN")).toBe(3000);
    expect(creditValue(200, "USD")).toBe(2);
    expect(creditValue(1, "NGN")).toBe(15);
    // The any-amount naira pack: ₦3,000 for 200 credits, so ₦4,500 buys 300, the same as $3.
    expect(creditsFor(4500, 3000, 200)).toBe(300);
    expect(creditsFor(3, 5, 500)).toBe(300);
  });

  it("starts at ₦3,000 and caps a purchase at the same value in both currencies", () => {
    expect(minPurchase("NGN")).toBe(3000);
    expect(minPurchase("USD")).toBe(5);
    expect(maxPurchase("USD")).toBe(1000);
    expect(maxPurchase("NGN")).toBe(1_500_000);
  });

  it("shows the naira sign, not the code", () => {
    expect(money(3000, "NGN")).toBe("₦3,000");
    expect(money(15, "NGN")).toBe("₦15");
    expect(money(5)).toBe("$5");
    expect(money(0.01)).toBe("$0.01");
    expect(money(67.5, "NGN")).toBe("₦67.50");
  });
});

describe("which currency a visitor sees", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it("uses Cloudflare's country first, then Vercel's", () => {
    expect(countryFrom(headers({ "cf-ipcountry": "NG", "x-vercel-ip-country": "US" }), "")).toBe("NG");
    expect(countryFrom(headers({ "x-vercel-ip-country": "ng" }), "")).toBe("NG");
    expect(countryFrom(headers({ "cf-ipcountry": "XX", "x-vercel-ip-country": "NG" }), "")).toBe("NG");
    expect(countryFrom(headers({ "cf-ipcountry": "T1" }), "")).toBeNull();
    expect(countryFrom(headers({}), "")).toBeNull();
  });

  it("lets PRICING_COUNTRY override the headers, for local testing", () => {
    expect(countryFrom(headers({ "cf-ipcountry": "US" }), "ng")).toBe("NG");
  });

  it("gives naira to Nigeria only", () => {
    expect(currencyForCountry("NG")).toBe("NGN");
    expect(currencyForCountry("GH")).toBe("USD");
    expect(currencyForCountry(null)).toBe("USD");
    expect(currencyForTimezone("Africa/Lagos")).toBe("NGN");
    expect(currencyForTimezone("Europe/London")).toBe("USD");
  });

  it("shows only that currency's packs, falling back to dollars when an instance has none", () => {
    const packs = [pack("USD", 5, 500), pack("NGN", 3000, 200), pack("NGN", 3000, 200, true)];
    expect(packsIn(packs, "NGN").map((item) => item.currency)).toEqual(["NGN", "NGN"]);
    expect(packsIn(packs, "USD").map((item) => item.id)).toEqual(["USD-5"]);
    expect(packsIn([pack("USD", 5, 500)], "NGN").map((item) => item.id)).toEqual(["USD-5"]);
  });
});

describe("the ?c= switch and naira checkout", () => {
  it("shows the chosen currency, else the visitor's", async () => {
    vi.stubEnv("PRICING_COUNTRY", "");
    expect(await displayCurrency("NG")).toBe("NGN");
    expect(await displayCurrency("ng")).toBe("NGN");
    expect(await displayCurrency(["US", "NG"])).toBe("USD");
    expect(await displayCurrency(undefined)).toBe("USD");
    expect(await displayCurrency("nigeria")).toBe("USD");
    vi.stubEnv("PRICING_COUNTRY", "NG");
    expect(await displayCurrency(null)).toBe("NGN");
    vi.unstubAllEnvs();
  });

  it("remembers the nav switch's choice, which a ?c= link still overrides", async () => {
    vi.stubEnv("PRICING_COUNTRY", "");
    saved = "NG";
    expect(await displayCurrency()).toBe("NGN");
    expect(await displayCurrency("US")).toBe("USD");
    saved = "US";
    expect(await displayCurrency()).toBe("USD");
    saved = "junk!";
    expect(await displayCurrency()).toBe("USD");
    saved = undefined;
    vi.unstubAllEnvs();
  });

  it("lets only a visitor from Nigeria pay in naira", () => {
    expect(mayPayIn("NGN", "NGN")).toBe(true);
    expect(mayPayIn("NGN", "USD")).toBe(false);
    expect(mayPayIn("USD", "USD")).toBe(true);
    expect(mayPayIn("USD", "NGN")).toBe(true);
  });
});
