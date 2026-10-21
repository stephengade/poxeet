import { money } from "../../billing/money";
import { appUrl } from "../../config";
import { actionPanel, footnote, heading, linkFallback, muted, paragraph, type EmailContent } from "../layout";

// Billing emails (D-022): the receipt after a credit purchase, and a warning when credits run low. Sent only
// when BILLING_ENABLED is on.

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const count = (value: number) => value.toLocaleString("en-US");

export type CreditsReceiptData = {
  firstName?: string | null;
  credits: number;
  amount: number;
  currency: string;
  paidAt: Date;
  /** Bachs' charge id, or the checkout id. */
  receiptId: string;
  balance: number;
  weeksLeft: number;
  expiresAt: Date;
};

/** After a verified payment has been credited. */
export function creditsReceipt(data: CreditsReceiptData): EmailContent {
  const url = `${appUrl()}/app/settings/credits`;
  return {
    subject: `Receipt: ${count(data.credits)} Poxeet credits`,
    preheader: `${money(data.amount, data.currency)} paid. Your balance is ${count(data.balance)} credits.`,
    body: [
      heading("Thanks, your credits are in"),
      paragraph([
        data.firstName ? `Hi ${data.firstName}, ` : "",
        "we received ", { strong: money(data.amount, data.currency) }, " and added ",
        { strong: `${count(data.credits)} credits` }, " to your account.",
      ]),
      paragraph([
        "Your balance is now ", { strong: `${count(data.balance)} credits` },
        data.weeksLeft > 0 ? `, about ${data.weeksLeft} ${data.weeksLeft === 1 ? "week" : "weeks"} of drafts at a typical pace.` : ".",
      ]),
      muted([`Credits from this purchase expire on ${DATE.format(data.expiresAt)} if unused. Purchases are not refundable.`]),
      actionPanel({ title: "See your credits", note: "Balance, purchases and usage", label: "Open Credits", href: url }),
      muted([`Paid ${DATE.format(data.paidAt)} · Receipt ${data.receiptId}`]),
    ],
    footer: [linkFallback(url), footnote("You get this email because you bought credits on Poxeet.")],
  };
}

/** `from`: the smallest top-up in the member's currency ("₦3,000" or "$5", D-033). */
export type CreditsLowData = { firstName?: string | null; balance: number; buyUrl: string; from?: string };

/** Once per top-up, when the balance drops below about a week of drafts. */
export function creditsLow(data: CreditsLowData): EmailContent {
  return {
    subject: data.balance > 0 ? "Your Poxeet credits are running low" : "You're out of Poxeet credits",
    preheader: `Top up from ${data.from ?? "$5"} so drafting doesn't stop.`,
    body: [
      heading(data.balance > 0 ? "Credits are running low" : "You're out of credits"),
      paragraph(data.balance > 0
        ? [data.firstName ? `Hi ${data.firstName}, you` : "You", " have ", { strong: `${count(data.balance)} credits` }, " left, less than a week of drafts at a typical pace."]
        : [data.firstName ? `Hi ${data.firstName}, your` : "Your", " balance has reached zero, so Poxeet can't draft or rewrite posts until you top up."]),
      actionPanel({ title: "Top up credits", note: `From ${data.from ?? "$5"}, no subscription`, label: "Buy credits", href: data.buyUrl }),
      paragraph("Prefer to pay your AI provider directly? Add your own key in Settings and credits won't be used."),
    ],
    footer: [linkFallback(data.buyUrl), footnote("You get this email once each time your balance runs low.")],
  };
}
