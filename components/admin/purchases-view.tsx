"use client";

import { useState } from "react";
import { byCurrency, money, moneyTotals, purchasesCsv } from "../../lib/admin/format";
import type { AdminEarnings, AdminPurchase, PurchaseStatus } from "../../lib/admin/types";
import { Banner, Button, EmptyState, Icon } from "../ui";
import { AdminHead, formatWhen, MemberWho, shortDate } from "./admin-ui";

// Purchases: credit packs bought through Bachs in the last 30 days, what the operator earned, refunds, and what
// the credits used cost on the provider (PRD BILL-7: totals for the admin, never member content).

const STATUS: Record<PurchaseStatus, string> = { paid: "Paid", refunded: "Refunded", partially_refunded: "Part refunded", pending: "Not paid yet", expired: "Abandoned" };
const FILTERS: Array<["all" | "paid" | "refunds" | "unpaid", string]> = [["all", "All"], ["paid", "Paid"], ["refunds", "Refunds"], ["unpaid", "Not paid"]];
type Filter = (typeof FILTERS)[number][0];

const SETTLED: PurchaseStatus[] = ["paid", "refunded", "partially_refunded"];

function matches(purchase: AdminPurchase, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "paid") return purchase.status === "paid";
  if (filter === "refunds") return purchase.refunded > 0;
  return purchase.status === "pending" || purchase.status === "expired";
}

function download(rows: AdminPurchase[]) {
  const blob = new Blob([purchasesCsv(rows)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `poxeet-purchases-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function PurchasesView({ earnings, base, timeZone, now }: { earnings: AdminEarnings; base: string; timeZone: string; now: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const settled = earnings.purchases.filter((purchase) => SETTLED.includes(purchase.status));
  const sales = byCurrency(settled, (row) => row.currency, (row) => row.amount);
  const refunded = byCurrency(settled.filter((row) => row.refunded > 0), (row) => row.currency, (row) => row.refunded);
  const net = byCurrency(settled, (row) => row.currency, (row) => row.amount - row.refunded);
  const refunds = settled.filter((row) => row.refunded > 0).length;
  const creditsSold = settled.reduce((sum, row) => sum + row.credits, 0);
  const cost = Math.round((earnings.creditsUsed / earnings.creditsPerCostDollar) * 100) / 100;
  const shortfalls = earnings.purchases.filter((row) => row.shortfall > 0);
  const buyers = new Set(settled.map((row) => row.memberId)).size;
  const packs = [...new Set(settled.map((row) => `${row.pack}|${row.currency}`))].map((key) => {
    const [pack, currency] = key.split("|");
    const rows = settled.filter((row) => row.pack === pack && row.currency === currency);
    return { key, pack, currency, count: rows.length, revenue: rows.reduce((sum, row) => sum + row.amount - row.refunded, 0) };
  }).sort((a, b) => b.revenue - a.revenue);
  const topPack = Math.max(1, ...packs.map((pack) => pack.revenue));
  const rows = earnings.purchases.filter((row) => matches(row, filter));
  const mainCurrency = Object.keys(sales)[0] ?? "USD";

  return (
    <>
      <AdminHead page="purchases" actions={<Button variant="secondary" icon="doc" onClick={() => download(earnings.purchases)} disabled={!earnings.purchases.length}>Export CSV</Button>}>
        Credit packs members bought through Bachs, what you earned, and refunds. Last 30 days.
      </AdminHead>

      <div className="wr-stats">
        <div className="wr-stat">
          <span className="wr-stat-label">Earned<span className="wr-stat-icon" data-tone="success"><Icon name="card" size={17} /></span></span>
          <span className="wr-stat-value wr-admin-money">{moneyTotals(net)}<small>net</small></span>
          <span className="wr-stat-foot"><b>{moneyTotals(sales)}</b> in sales, less refunds</span>
        </div>
        <div className="wr-stat">
          <span className="wr-stat-label">Purchases<span className="wr-stat-icon" data-tone="brand"><Icon name="check" size={17} /></span></span>
          <span className="wr-stat-value">{settled.length}<small>paid</small></span>
          <span className="wr-stat-foot">{settled.length ? <>From {buyers} {buyers === 1 ? "member" : "members"} · avg <b>{money((sales[mainCurrency] ?? 0) / Math.max(1, settled.filter((row) => row.currency === mainCurrency).length), mainCurrency)}</b></> : "None yet"}</span>
        </div>
        <div className="wr-stat">
          <span className="wr-stat-label">Refunded<span className="wr-stat-icon" data-tone="warning"><Icon name="refresh" size={17} /></span></span>
          <span className="wr-stat-value wr-admin-money">{moneyTotals(refunded)}<small>{refunds} {refunds === 1 ? "refund" : "refunds"}</small></span>
          <span className="wr-stat-foot">{shortfalls.length ? <b data-tone="warning">{shortfalls.reduce((sum, row) => sum + row.shortfall, 0).toLocaleString("en-US")} credits already spent</b> : "Nothing to recover"}</span>
        </div>
        <div className="wr-stat">
          <span className="wr-stat-label">AI cost of credits used<span className="wr-stat-icon" data-tone="violet"><Icon name="sparkle" size={17} /></span></span>
          <span className="wr-stat-value wr-admin-money">{money(cost)}<small>est.</small></span>
          <span className="wr-stat-foot"><b>{earnings.creditsUsed.toLocaleString("en-US")}</b> credits used · {creditsSold.toLocaleString("en-US")} sold{earnings.creditsGranted ? ` · ${earnings.creditsGranted.toLocaleString("en-US")} granted` : ""}</span>
        </div>
      </div>

      {shortfalls.map((row) => (
        <Banner key={row.id} tone="warning" title={`${row.name} was refunded after spending credits`} action={<Button size="sm" variant="secondary" href={`${base}/members?member=${row.memberId}`}>Open member</Button>}>
          Bachs refunded {money(row.refunded, row.currency)} for the {row.pack} pack on {shortDate(row.at, timeZone)}. Their balance went to zero; {row.shortfall.toLocaleString("en-US")} credits had already been used and couldn&apos;t be taken back.
        </Banner>
      ))}

      <div className="wr-admin-grid">
        <section className="wr-card wr-table-card">
          <div className="wr-admin-toolbar">
            <h2 className="wr-h2">Purchases</h2>
            <div className="wr-filter" role="group" aria-label="Show">
              {FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
            </div>
          </div>
          {rows.length === 0 ? (
            <EmptyState title={earnings.purchases.length ? "Nothing here" : "No purchases yet"} icon="card">
              {earnings.purchases.length ? "No purchases of this kind in the last 30 days." : "When members buy credits, each purchase shows here with what you earned."}
            </EmptyState>
          ) : (
            <ul className="wr-admin-list wr-admin-purchases" aria-label="Purchases">
              <li className="wr-admin-list-head" aria-hidden="true"><span>Member</span><span>Pack</span><span>Amount</span><span>Status</span></li>
              {rows.map((row) => {
                const when = formatWhen(row.at, timeZone, now);
                return (
                  <li key={row.id}>
                    <div className="wr-admin-row">
                      <MemberWho member={row} />
                      <span className="wr-admin-cell-ai">
                        <span className="wr-small"><b>{row.pack}</b> · {row.credits.toLocaleString("en-US")} credits</span>
                        <span className="wr-small wr-muted">{when.day}, {when.time}</span>
                      </span>
                      <span className="wr-admin-cell-usage wr-admin-amount wr-admin-money">
                        {row.refunded > 0 && row.refunded >= row.amount ? <s>{money(row.amount, row.currency)}</s> : money(row.amount, row.currency)}
                        {row.refunded > 0 && <span>−{money(row.refunded, row.currency)} refunded</span>}
                      </span>
                      <span className="wr-admin-cell-status"><span className="wr-tag" data-kind={row.status}>{STATUS[row.status]}</span></span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="wr-card wr-card-flush">
          <div className="wr-settings-card-head"><h2 className="wr-h2">By pack</h2><p className="wr-sub wr-small">Net of refunds.</p></div>
          {packs.length ? (
            <ul className="wr-admin-packs">
              {packs.map((pack) => (
                <li key={pack.key}>
                  <span><strong>{pack.pack}</strong> <span className="wr-small wr-muted">· {pack.count} {pack.count === 1 ? "sale" : "sales"}</span></span>
                  <strong className="wr-admin-money">{money(pack.revenue, pack.currency)}</strong>
                  <span className="wr-admin-bar" aria-hidden="true"><span style={{ width: `${(pack.revenue / topPack) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : <p className="wr-small wr-muted wr-admin-empty-note">Sales by pack show once someone buys.</p>}
        </section>
      </div>

      <p className="wr-small wr-muted">Amounts are what Bachs charged, before its fees. Granted credits aren&apos;t sales; they&apos;re in the audit log. The AI cost is an estimate from the shared model&apos;s list price: credits used ÷ {Math.round(earnings.creditsPerCostDollar).toLocaleString("en-US")} per dollar.</p>
    </>
  );
}
