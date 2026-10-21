// Adds and edits credit packs, until the admin pages exist (D-022). Migration 202610150006 already adds the
// default packs ($5, $10, $20 +5%, $50 +10%, any amount from $5) and 202610210001 the naira ones (D-033: ₦3,000,
// ₦7,500, ₦15,000, ₦30,000 +5%, ₦75,000 +10%, any amount from ₦3,000); use this to change them.
//   pnpm packs list
//   pnpm packs add --price 20 [--bonus 5] [--name "2,100 credits"] [--credits 2100] [--currency USD|NGN] [--sort 3] [--custom]
//   pnpm packs edit <pack id> [--name ..] [--price ..] [--bonus ..] [--credits ..] [--sort ..] [--active true|false]
//   pnpm packs seed      (adds the default packs of each currency that has none)
//
// Credits default to price x 100 (1 credit = $0.01) plus the bonus; a naira price is first turned into dollars at
// NGN_PER_USD (₦3,000 = $2 = 200 credits). --custom makes an "any amount" pack: --price is
// then the minimum and members choose how much to pay, at the same credits per dollar. No Bachs product is needed:
// checkout charges the pack's price directly. --product <bachs product id> is optional, if you want a product shown
// at checkout. The Credits page, the landing page and /pricing all read this table.
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { CREDITS_PER_DOLLAR, minPurchase, perDollar } from "../lib/billing/config";

const USAGE = `Usage:
  pnpm packs list
  pnpm packs add --price <amount> [--bonus <percent>] [--name <name>] [--credits <n>] [--currency USD|NGN] [--sort <n>] [--custom] [--product <bachs id>]
  pnpm packs edit <pack id> [--name ..] [--price ..] [--bonus ..] [--credits ..] [--sort ..] [--active true|false] [--product <bachs id or "none">]
  pnpm packs seed`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    price: { type: "string" },
    bonus: { type: "string" },
    credits: { type: "string" },
    currency: { type: "string" },
    sort: { type: "string" },
    active: { type: "string" },
    custom: { type: "boolean", default: false },
    product: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const MISSING_ENV = "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fail(MISSING_ENV);
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || fail(MISSING_ENV);

function number(name: string, value: string | undefined, { integer = false, min = 0 } = {}) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) fail(`--${name} must be ${integer ? "a whole number" : "a number"} of at least ${min}.`);
  return parsed;
}

/** Credits for a price with a bonus: $20 at 5% is 2,000 + 100 = 2,100; ₦30,000 at 5% is the same. */
function creditsFor(price: number, bonus: number, currency = "USD") {
  return Math.floor((price / perDollar(currency)) * CREDITS_PER_DOLLAR * (1 + bonus / 100));
}

type Row = { id: string; name: string; credits: number; price_amount: number; currency: string; bonus_percent: number; custom_amount: boolean; active: boolean; sort: number; bachs_product_id: string | null };

const count = (value: number) => value.toLocaleString("en-US");

function defaults(currency: string, packs: Array<{ price: number; bonus: number }>) {
  const min = minPurchase(currency);
  return [
    ...packs.map((pack, index) => ({
      name: `${count(creditsFor(pack.price, pack.bonus, currency))} credits`, price_amount: pack.price, bonus_percent: pack.bonus,
      credits: creditsFor(pack.price, pack.bonus, currency), currency, sort: index + 1, custom_amount: false,
    })),
    { name: "Any amount", price_amount: min, bonus_percent: 0, credits: creditsFor(min, 0, currency), currency, sort: packs.length + 1, custom_amount: true },
  ];
}

/** D-022 and D-033. Same as migrations 202610150006 and 202610210001. */
const DEFAULTS: Record<string, ReturnType<typeof defaults>> = {
  USD: defaults("USD", [{ price: 5, bonus: 0 }, { price: 10, bonus: 0 }, { price: 20, bonus: 5 }, { price: 50, bonus: 10 }]),
  NGN: defaults("NGN", [{ price: 3000, bonus: 0 }, { price: 7500, bonus: 0 }, { price: 15000, bonus: 0 }, { price: 30000, bonus: 5 }, { price: 75000, bonus: 10 }]),
};

async function main() {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const [command, target] = positionals;

  async function list() {
    const { data, error } = await supabase.from("credit_packs").select("*").order("sort").order("price_amount");
    if (error) fail(`Couldn't read packs: ${error.message}`);
    if (!data?.length) return console.log("No packs yet. Add one with: pnpm packs add ...");
    console.table((data as Row[]).map((pack) => ({
      id: pack.id, name: pack.name, price: `${pack.custom_amount ? "from " : ""}${pack.price_amount} ${pack.currency}`,
      credits: pack.credits, bonus: `${pack.bonus_percent}%`, active: pack.active, sort: pack.sort, product: pack.bachs_product_id ?? "",
    })));
  }

  if (command === "list") return list();

  if (command === "add") {
    if (!flags.price) fail(USAGE);
    const currency = (flags.currency ?? "USD").toUpperCase();
    const price = number("price", flags.price, { min: minPurchase(currency) })!;
    const bonus = number("bonus", flags.bonus, { integer: true }) ?? 0;
    const credits = number("credits", flags.credits, { integer: true, min: 1 }) ?? creditsFor(price, bonus, currency);
    const { error } = await supabase.from("credit_packs").insert({
      bachs_product_id: flags.product ?? null, name: flags.name ?? (flags.custom ? "Any amount" : `${count(credits)} credits`),
      price_amount: price, bonus_percent: bonus, credits,
      currency, sort: number("sort", flags.sort, { integer: true }) ?? 0, custom_amount: flags.custom,
    });
    if (error) fail(`Couldn't add the pack: ${error.message}`);
    return list();
  }

  if (command === "edit") {
    if (!target) fail(USAGE);
    const { data: pack } = /^[0-9a-f-]{36}$/i.test(target) ? await supabase.from("credit_packs").select("*").eq("id", target).maybeSingle() : { data: null };
    if (!pack) fail(`No pack with id ${target}. Run "pnpm packs list" for the ids.`);
    const current = pack as Row;
    const currency = (flags.currency ?? current.currency).toUpperCase();
    const price = number("price", flags.price, { min: minPurchase(currency) }) ?? Number(current.price_amount);
    const bonus = number("bonus", flags.bonus, { integer: true }) ?? current.bonus_percent;
    const repriced = flags.price !== undefined || flags.bonus !== undefined;
    if (flags.active !== undefined && !["true", "false"].includes(flags.active)) fail("--active takes true or false.");
    const { error } = await supabase.from("credit_packs").update({
      ...(flags.name ? { name: flags.name } : {}),
      price_amount: price, bonus_percent: bonus,
      credits: number("credits", flags.credits, { integer: true, min: 1 }) ?? (repriced ? creditsFor(price, bonus, currency) : current.credits),
      ...(flags.currency ? { currency: flags.currency.toUpperCase() } : {}),
      ...(flags.sort !== undefined ? { sort: number("sort", flags.sort, { integer: true }) } : {}),
      ...(flags.active !== undefined ? { active: flags.active === "true" } : {}),
      ...(flags.product !== undefined ? { bachs_product_id: flags.product === "none" ? null : flags.product } : {}),
    }).eq("id", current.id);
    if (error) fail(`Couldn't update the pack: ${error.message}`);
    return list();
  }

  if (command === "seed") {
    const { data: existing, error: readError } = await supabase.from("credit_packs").select("currency");
    if (readError) fail(`Couldn't read packs: ${readError.message}`);
    const have = new Set((existing ?? []).map((pack) => pack.currency));
    const missing = Object.entries(DEFAULTS).filter(([currency]) => !have.has(currency)).flatMap(([, packs]) => packs);
    if (!missing.length) {
      console.log("Every currency already has packs, so nothing was added. Change them with pnpm packs edit.");
      return list();
    }
    const { error } = await supabase.from("credit_packs").insert(missing);
    if (error) fail(`Couldn't add the default packs: ${error.message}`);
    return list();
  }

  fail(USAGE);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
