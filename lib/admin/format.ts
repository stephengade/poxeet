import { money } from "../billing/money";
import type { AdminPurchase } from "./types";

// Formatting shared by the admin views and the server: money, totals and the purchases export. Safe in the browser.

/** An amount in a currency with its local symbol ("₦3,000", "$5"), without cents when it's whole. */
export { money };

/** Totals per currency, shown side by side: "$68 · €10". "$0" when there are none. */
export function moneyTotals(totals: Record<string, number>) {
  const entries = Object.entries(totals);
  return entries.length ? entries.map(([currency, value]) => money(value, currency)).join(" · ") : money(0);
}

const csvCell = (value: string | number) => {
  const text = String(value);
  // Quote anything with a comma, quote or line break; a leading = + - @ is neutralised so a spreadsheet can't run it.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** The purchases list as CSV, for Export. Amounts in the checkout's currency. */
export function purchasesCsv(rows: AdminPurchase[]) {
  const head = ["Date (UTC)", "Member", "Email", "Pack", "Credits", "Amount", "Currency", "Status", "Refunded", "Credits not recovered"];
  const lines = rows.map((row) => [
    row.at.slice(0, 16).replace("T", " "), row.name, row.email, row.pack, row.credits, row.amount.toFixed(2), row.currency, row.status,
    row.refunded.toFixed(2), row.shortfall,
  ].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\r\n");
}

/** Totals per currency, so mixed-currency packs never add up into a wrong number. */
export function byCurrency<T>(rows: T[], currency: (row: T) => string, amount: (row: T) => number) {
  const totals: Record<string, number> = {};
  for (const row of rows) totals[currency(row)] = Math.round(((totals[currency(row)] ?? 0) + amount(row)) * 100) / 100;
  return totals;
}
