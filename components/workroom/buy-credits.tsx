"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CREDIT_EXPIRY_MONTHS, creditValue, maxPurchase } from "../../lib/billing/config";
import { money } from "../../lib/billing/money";
import { Button, Icon, Input } from "../ui";

export type PackView = { id: string; name: string; credits: number; price: number; currency: string; bonusPercent: number; customAmount: boolean };

type Props = {
  /** Packs in the visitor's currency (D-033): naira in Nigeria, dollars elsewhere. */
  packs: PackView[];
  balance: number;
  /** Credits a typical week of drafting costs, for "about N weeks" next to each pack. */
  weeklyCost: number;
  /** APP_URL: where Bachs sends the member back after paying. */
  returnTo: string;
  /** Open on load, for links like /app/settings/credits?buy=1 from emails and banners. */
  defaultOpen?: boolean;
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
};

const subscribeNothing = () => () => {};
const count = (value: number) => value.toLocaleString("en-US");
const weeksText = (credits: number, weekly: number) => {
  const weeks = Math.floor(credits / Math.max(1, weekly));
  return weeks >= 1 ? `about ${count(weeks)} ${weeks === 1 ? "week" : "weeks"} of drafts` : "less than a week of drafts";
};

/**
 * "Buy credits": a button that opens a sheet with every pack, an any-amount option, what the member pays and
 * gets, and one button to Bachs' hosted checkout. The sheet is a plain form POST to /api/billing/checkout.
 */
export function BuyCredits({ packs, balance, weeklyCost, returnTo, defaultOpen = false, label = "Buy credits", variant = "primary", size = "md" }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // The sheet needs the browser (it portals into the page), so it waits for hydration even when open on load.
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false);
  return (
    <>
      <Button variant={variant} size={size} icon="card" onClick={() => setOpen(true)}>{label}</Button>
      {open && inBrowser && <BuySheet packs={packs} balance={balance} weeklyCost={weeklyCost} returnTo={returnTo} onClose={() => setOpen(false)} />}
    </>
  );
}

function BuySheet({ packs, balance, weeklyCost, returnTo, onClose }: Omit<Props, "defaultOpen" | "label" | "variant" | "size"> & { onClose: () => void }) {
  const id = useId();
  const sheet = useRef<HTMLFormElement>(null);
  const fixed = packs.filter((pack) => !pack.customAmount);
  const custom = packs.find((pack) => pack.customAmount) ?? null;
  const currency = packs[0]?.currency ?? "USD";
  const naira = currency === "NGN";
  const bestBonus = Math.max(0, ...fixed.map((pack) => pack.bonusPercent));
  const [selected, setSelected] = useState(fixed[1]?.id ?? fixed[0]?.id ?? custom?.id ?? "");
  const [amount, setAmount] = useState(custom ? String(custom.price * 2) : "");
  const [submitting, setSubmitting] = useState(false);

  // Escape closes; the page behind doesn't scroll; focus moves in and comes back.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const pack = packs.find((item) => item.id === selected) ?? null;
  const chosen = Number(amount);
  const amountValid = !pack?.customAmount || (amount !== "" && chosen >= pack.price && chosen <= maxPurchase(pack.currency));
  const pay = pack ? (pack.customAmount ? (amountValid ? Math.round(chosen * 100) / 100 : null) : pack.price) : null;
  const credits = pack && pay !== null ? (pack.customAmount ? Math.floor((pay * pack.credits) / pack.price) : pack.credits) : null;
  // Bachs sends the member back to APP_URL. Browsing on another address (localhost while APP_URL is a tunnel),
  // they'd come back signed out, since sign-in belongs to one address: say so before they pay.
  const returnOrigin = (() => { try { return new URL(returnTo).origin; } catch { return null; } })();
  const elsewhere = Boolean(returnOrigin) && window.location.origin !== returnOrigin;
  const expires = new Date();
  expires.setMonth(expires.getMonth() + CREDIT_EXPIRY_MONTHS);

  return createPortal(
    <div className="wr-sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form
        ref={sheet} className="wr-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}
        method="post" action="/api/billing/checkout"
        onSubmit={(event) => { if (!pack || pay === null) return event.preventDefault(); setSubmitting(true); }}
      >
        <div className="wr-sheet-head">
          <div>
            <h2 id={`${id}-title`} className="wr-h2">Buy credits</h2>
            <p className="wr-small wr-muted">You have {count(balance)} credits. 1 credit is {money(creditValue(1, currency), currency)}.</p>
          </div>
          <button type="button" className="wr-icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="wr-sheet-body">
          {elsewhere && returnOrigin && (
            <div className="wr-buy-notice" role="note">
              <Icon name="info" size={16} />
              <span>
                After paying you&apos;ll come back to <strong>{new URL(returnOrigin).host}</strong>, where you aren&apos;t signed in.{" "}
                <a href={`${returnOrigin}/app/settings/credits?buy=1`} className="wr-link">Open Poxeet there</a> to buy without signing in again.
              </span>
            </div>
          )}
          {packs.length === 0 ? (
            <div className="wr-sheet-empty">
              <Icon name="card" size={22} />
              <strong>Credit packs aren&apos;t on sale yet</strong>
              <span className="wr-small wr-muted">Check back soon, or add your own AI key in AI access to keep going.</span>
            </div>
          ) : (
            <fieldset className="wr-buy-options">
              <legend className="wr-small wr-muted">Choose an amount</legend>
              {fixed.map((item) => (
                <label key={item.id} className="wr-buy-option">
                  <input type="radio" name="packId" value={item.id} checked={selected === item.id} onChange={() => setSelected(item.id)} />
                  <span className="wr-buy-price">{money(item.price, item.currency)}</span>
                  <span className="wr-buy-detail">
                    <strong>{count(item.credits)} credits</strong>
                    <span>{weeksText(item.credits, weeklyCost)}</span>
                  </span>
                  {item.bonusPercent > 0 && <span className="wr-pack-bonus">{item.bonusPercent === bestBonus ? "Best value · " : ""}+{item.bonusPercent}%</span>}
                </label>
              ))}
              {custom && (
                <label className="wr-buy-option wr-buy-custom">
                  <input type="radio" name="packId" value={custom.id} checked={selected === custom.id} onChange={() => setSelected(custom.id)} />
                  <span className="wr-buy-detail">
                    <strong>Any amount</strong>
                    <span>From {money(custom.price, custom.currency)}, at {count(custom.credits)} credits per {money(custom.price, custom.currency)}</span>
                  </span>
                  {selected === custom.id && (
                    <Input
                      label={naira ? "Amount in naira" : "Amount in US dollars"} name="amount" type="number" inputMode={naira ? "numeric" : "decimal"}
                      min={custom.price} max={maxPurchase(custom.currency)} step={naira ? "1" : "0.01"} autoFocus
                      value={amount} onChange={(event) => setAmount(event.target.value)} className="wr-buy-amount"
                      error={amount !== "" && !amountValid ? `Choose ${money(custom.price, custom.currency)} to ${money(maxPurchase(custom.currency), custom.currency)}.` : undefined}
                    />
                  )}
                </label>
              )}
            </fieldset>
          )}

          <ul className="wr-buy-facts">
            <li><Icon name="shield" size={16} /><span>Secure checkout by Bachs. Card details never reach Poxeet.</span></li>
            <li><Icon name="clock" size={16} /><span>Credits expire {CREDIT_EXPIRY_MONTHS} months after you buy them. Oldest are used first.</span></li>
            <li><Icon name="check" size={16} /><span>No subscription, nothing renews. Purchases are final.</span></li>
          </ul>
          <p className="wr-small wr-muted">
            <Link href="/pricing" className="wr-link" target="_blank">How pricing works</Link> · <Link href="/terms" className="wr-link" target="_blank">Terms</Link>
          </p>
        </div>

        {packs.length > 0 && (
          <div className="wr-sheet-foot">
            <span className="wr-buy-total">
              <strong>{pay !== null && pack ? money(pay, pack.currency) : "—"}</strong>
              <span className="wr-small wr-muted">
                {credits !== null ? `${count(credits)} credits · expire ${expires.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "Choose an amount"}
              </span>
            </span>
            <Button type="submit" loading={submitting} disabled={pay === null} iconRight="send">
              {submitting ? "Opening checkout" : "Continue to checkout"}
            </Button>
          </div>
        )}
      </form>
    </div>,
    // Inside the workroom shell, so its colour variables apply.
    document.querySelector(".wr-shell") ?? document.body,
  );
}
