// Money as members read it, in the browser and on the server: "$5", "$0.01", "₦3,000", "₦15".

/** An amount with its local symbol (₦, not NGN), without decimals when it's whole. */
export function money(amount: number, currency = "USD") {
  const whole = Number.isInteger(Math.round(amount * 100) / 100);
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2,
  }).format(amount);
}
