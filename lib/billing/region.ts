import { cookies, headers } from "next/headers";
import { CURRENCY_COOKIE } from "./config";
import type { CreditPack } from "./credits";

// Which currency a visitor sees prices in (D-033). Nigeria pays in naira, everyone else in dollars. The country
// comes from the edge in front of the app: Cloudflare's cf-ipcountry when the domain is proxied through it (first,
// since on Vercel behind Cloudflare, Vercel would see Cloudflare's address), else Vercel's x-vercel-ip-country.
// PRICING_COUNTRY overrides both, for local testing. Public pages also let anyone pick naira or dollars (the switch
// in the site nav, remembered in a cookie, or a ?c=NG link), but naira checkout stays for requests from Nigeria, so a
// weaker naira can't be bought from abroad at our fixed rate.

export type PricingCurrency = "NGN" | "USD";

const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country"];

/** The currency for a two-letter country code (any case); unknown or missing countries get dollars. */
export function currencyForCountry(country: string | null | undefined): PricingCurrency {
  return country?.trim().toUpperCase() === "NG" ? "NGN" : "USD";
}

/** The country from request headers, or PRICING_COUNTRY when set. */
export function countryFrom(list: Pick<Headers, "get">, override = process.env.PRICING_COUNTRY) {
  if (override?.trim()) return override.trim().toUpperCase();
  for (const name of COUNTRY_HEADERS) {
    const value = list.get(name)?.trim().toUpperCase();
    // Cloudflare sends XX for unknown and T1 for Tor.
    if (value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1") return value;
  }
  return null;
}

/** This request's pricing currency. Reads headers, so the page renders per request. */
export async function pricingCurrency(): Promise<PricingCurrency> {
  return currencyForCountry(countryFrom(await headers()));
}

const isCountry = (value: string | null | undefined): value is string => Boolean(value && /^[a-z]{2}$/i.test(value.trim()));

/**
 * The currency public pages show prices in, for anyone: a `?c=NG` or `?c=US` link first, then the site nav's switch
 * (its cookie), then the visitor's country. So a Nigerian abroad can see naira prices. Display only: paying in naira
 * still needs the request to come from Nigeria (`mayPayIn`).
 */
export async function displayCurrency(choice?: string | string[] | null): Promise<PricingCurrency> {
  const picked = Array.isArray(choice) ? choice[0] : choice;
  if (isCountry(picked)) return currencyForCountry(picked);
  const saved = (await cookies()).get(CURRENCY_COOKIE)?.value;
  if (isCountry(saved)) return currencyForCountry(saved);
  return pricingCurrency();
}

/** Whether a purchase in `packCurrency` is allowed for a visitor paying in `visitorCurrency`: naira from Nigeria only. */
export function mayPayIn(packCurrency: string, visitorCurrency: PricingCurrency) {
  return packCurrency !== "NGN" || visitorCurrency === "NGN";
}

/** Packs sold in `currency`, or the dollar packs when an instance has none in it. */
export function packsIn(packs: CreditPack[], currency: PricingCurrency) {
  const local = packs.filter((pack) => pack.currency === currency);
  return local.length ? local : packs.filter((pack) => pack.currency === "USD");
}

/** For emails, where there is no request: members whose time zone is Lagos get naira. */
export function currencyForTimezone(timezone: string | null | undefined): PricingCurrency {
  return timezone === "Africa/Lagos" ? "NGN" : "USD";
}
