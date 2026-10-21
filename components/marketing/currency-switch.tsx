"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CURRENCY_COOKIE } from "../../lib/billing/config";

type Currency = "NGN" | "USD";

const OPTIONS: Array<{ currency: Currency; country: string; symbol: string; label: string }> = [
  { currency: "NGN", country: "NG", symbol: "₦", label: "Naira" },
  { currency: "USD", country: "US", symbol: "$", label: "Dollars" },
];

/** Remembers the choice for a year. Outside the component: React doesn't let render-scope code write globals. */
function remember(country: string) {
  document.cookie = `${CURRENCY_COOKIE}=${country}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * ₦ Naira / $ Dollars, fixed at the top right of the showroom pages (D-033): which currency public pages show prices in, for anyone. The choice is kept in a
 * cookie for a year and put in the address (?c=NG), so the page re-renders at once and the link can be shared.
 * Display only: paying in naira still needs a request from Nigeria.
 */
export function CurrencySwitch({ initial }: { initial: Currency }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const fromLink = params.get("c")?.toUpperCase();
  const current: Currency = fromLink ? (fromLink === "NG" ? "NGN" : "USD") : initial;

  function choose(option: (typeof OPTIONS)[number]) {
    if (option.currency === current) return;
    remember(option.country);
    const next = new URLSearchParams(params);
    next.set("c", option.country);
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }

  return (
    <div className="currency-switch" role="group" aria-label="Show prices in" aria-busy={pending || undefined}>
      {OPTIONS.map((option) => (
        <button
          key={option.currency} type="button" aria-pressed={current === option.currency} onClick={() => choose(option)}
          aria-label={`Prices in ${option.label.toLowerCase()}`}
        >
          <span aria-hidden="true">{option.symbol}</span>
          <span className="currency-switch-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
