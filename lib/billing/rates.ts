import { CREDITS_PER_DOLLAR } from "./config";

// What AI work costs in credits (D-022, D-034). Credits are charged from the tokens each job really used, always at
// Claude Sonnet's list price, whichever model the shared key runs on:
//   credits per 1M tokens = Sonnet's list price per 1M tokens x margin x 100 (credits per dollar)
// At the default 6x, $1 of Sonnet cost is charged $6. A cheaper model (DeepSeek) never lowers what members pay;
// the difference pays for running the service, and members' prices don't reveal which model we use. Prices are the providers' list prices in USD per million tokens;
// the table also gives the admin an estimate of what credits really cost us.

type Price = { input: number; output: number };

const PROVIDER_PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "deepseek-flash": { input: 0.3, output: 1.2 },
  "deepseek-chat": { input: 0.3, output: 1.2 },
};

/** What members are charged on: Claude Sonnet's list price, the top plan (D-034). */
const BILLED: Price = PROVIDER_PRICES["claude-sonnet-5-5"];

/** Margin over Sonnet's price: $1 of cost is charged $6 (D-034). CREDIT_MARGIN overrides it. */
export const DEFAULT_MARGIN = 6;
export function margin() {
  const value = Number(process.env.CREDIT_MARGIN ?? DEFAULT_MARGIN);
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_MARGIN;
}

export type Rates = { input: number; output: number };

/** Credits per million input and output tokens, the same for every model (D-034): 1,200 read, 6,000 written. */
export function creditRates(): Rates {
  const price = BILLED;
  const factor = margin() * CREDITS_PER_DOLLAR;
  // Rounded so float noise (0.3 x 300 = 90.00000000000001) can't add a credit.
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return { input: round(price.input * factor), output: round(price.output * factor) };
}

export type TokenUsage = { inputTokens: number; outputTokens: number };

/** PRD section 8: ceil((input x input rate + output x output rate) / 1,000,000). A job that used tokens costs at least 1. */
export function jobCost(usage: TokenUsage) {
  const rates = creditRates();
  const input = Math.max(0, usage.inputTokens);
  const output = Math.max(0, usage.outputTokens);
  return Math.ceil((input * rates.input + output * rates.output) / 1_000_000);
}

/**
 * A typical member's week: three posts drafted, a few rewrites and an occasional voice re-analysis. About
 * 200k input and 50k output tokens a month (D-022). These are estimates; generation_usage has the real numbers.
 */
export const TYPICAL_WEEK: TokenUsage = { inputTokens: 50_000, outputTokens: 12_500 };

/** Rough token use of each kind of job, for the pricing page. Estimates until generation_usage says otherwise. */
export const JOB_ESTIMATES: Array<{ job: string; label: string; usage: TokenUsage }> = [
  { job: "analyze", label: "Learn your voice from your past posts", usage: { inputTokens: 60_000, outputTokens: 4_000 } },
  { job: "draft", label: "Draft a week of posts (3 posts)", usage: { inputTokens: 30_000, outputTokens: 6_000 } },
  { job: "rewrite", label: "Rewrite one post", usage: { inputTokens: 3_000, outputTokens: 600 } },
];

/** Credits a typical week costs; never less than 1. */
export function weeklyCost() {
  return Math.max(1, jobCost(TYPICAL_WEEK));
}

/** Whole weeks of typical drafting a balance pays for. */
export function weeksLeft(balance: number) {
  return Math.max(0, Math.floor(balance / weeklyCost()));
}

/** Below about one week of drafts. */
export function isLowBalance(balance: number) {
  return balance < weeklyCost();
}

/**
 * For the admin's cost estimate only: what a typical week really costs on `model`, as a share of Sonnet's price
 * (DeepSeek about 13%, Opus 200%). A model missing from the table counts as Sonnet.
 */
export function costShare(model: string | null) {
  const price = (model && PROVIDER_PRICES[model]) || BILLED;
  const dollars = (rate: Price) => TYPICAL_WEEK.inputTokens * rate.input + TYPICAL_WEEK.outputTokens * rate.output;
  return dollars(price) / dollars(BILLED);
}

/** Credits a purchase of `amount` dollars buys from a pack priced `packPrice` for `packCredits` (bonus included). */
export function creditsFor(amount: number, packPrice: number, packCredits: number) {
  return Math.floor((amount * packCredits) / packPrice);
}
