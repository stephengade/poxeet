import { Suspense } from "react";
import { displayCurrency } from "../../lib/billing/region";
import { CurrencySwitch } from "./currency-switch";
import { publicPacks } from "./hosted-pricing";

/** The ₦ / $ switch (D-033), only when the instance sells naira packs. Reads the visitor's choice or country. */
async function CurrencySwitchLoader() {
  const [packs, currency] = await Promise.all([publicPacks(), displayCurrency()]);
  if (!packs.some((pack) => pack.currency === "NGN")) return null;
  return <CurrencySwitch initial={currency} />;
}

/**
 * Fixed at the top right of the showroom pages that show prices, on its own beside the centred nav (768px and up).
 * Streams in after the page, since it depends on the request.
 */
export function CurrencyCorner() {
  return <div className="currency-corner"><Suspense fallback={null}><CurrencySwitchLoader /></Suspense></div>;
}

/** The same switch for the site nav's `currency` slot, shown there on phones only. */
export function NavCurrency() {
  return <Suspense fallback={null}><CurrencySwitchLoader /></Suspense>;
}
