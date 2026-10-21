// Adds someone to the allowlist from the command line. The admin pages (/admin/access) do the same.
//   pnpm invite <email> <first name> <last name> [--code CODE01] [--type all|code|email] [--expires 30d|2w|3m|1y|never] [--admin] [--send]
//
// --type     how they may create their account: "all" (email or access code, the default), "code" (access code
//            only), or "email" (their email only; no code is created). Sign-in is always by email.
// --code     the access code; generated when left out. Ignored for --type email.
// --expires  when the access code stops working: days (d), weeks (w), months (m) or years (y). Default 30d.
// --send     email the invite (with the access code) through Zoho.
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env. Re-running for the same email updates the
// entry and replaces the code and its expiry.
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { expiryFrom as expiryAfter, newAccessCode } from "../lib/admin/rules";
import { appUrl } from "../lib/config";
import { email as mail } from "../lib/email";

const USAGE = "Usage: pnpm invite <email> <first name> <last name> [--code CODE01] [--type all|code|email] [--expires 30d|2w|3m|1y|never] [--admin] [--send]";
type AccessType = "all" | "code" | "email";

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    code: { type: "string" },
    type: { type: "string", default: "all" },
    expires: { type: "string", default: "30d" },
    admin: { type: "boolean", default: false },
    send: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [rawEmail, firstName, lastName] = positionals;
if (!rawEmail || !firstName || !lastName) fail(USAGE);
if (!["all", "code", "email"].includes(flags.type)) fail(`--type must be all, code or email.\n${USAGE}`);
const accessType = flags.type as AccessType;

const MISSING_ENV = "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fail(MISSING_ENV);
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || fail(MISSING_ENV);

/** "3d", "2w", "3m", "1y" from now, or null for "never". */
function expiryFrom(text: string) {
  const date = expiryAfter(text);
  if (date === undefined) fail(`--expires takes a number and d, w, m or y (like 3d or 3m), or "never".
${USAGE}`);
  return date;
}

const usesCode = accessType !== "email";
const code = usesCode ? (flags.code ?? newAccessCode()).trim().toUpperCase() : null;
if (code && !/^[A-Z0-9-]{4,32}$/.test(code)) fail("Access codes are 4 to 32 letters, numbers or dashes.");
const expires = usesCode ? expiryFrom(flags.expires) : null;

const email = rawEmail.trim().toLowerCase();
const row = {
  email,
  first_name: firstName.trim(),
  last_name: lastName.trim(),
  access_type: accessType,
  access_code: code,
  access_code_expires_at: expires?.toISOString() ?? null,
  ...(flags.admin ? { role: "admin" } : {}),
};

// One async function: tsx runs this file as CommonJS, where top-level await isn't allowed.
async function main() {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from("allowlist").upsert(row, { onConflict: "email" });
  if (error) fail(error.code === "23505" ? `The code ${code} is already in use. Pick another.` : error.message);

  const how = { all: "email or access code", code: "access code only", email: "email only" }[accessType];
  console.log(`Invited ${row.first_name} ${row.last_name} <${email}>${flags.admin ? " as admin" : ""}. Creates the account by ${how}.`);
  if (code) {
    console.log(`Access code: ${code} (${expires ? `expires ${expires.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "never expires"})`);
    console.log(`Sign-up link: ${appUrl()}/signup?code=${encodeURIComponent(code)}`);
  } else {
    console.log(`Sign-up link: ${appUrl()}/signup?email=${encodeURIComponent(email)}`);
  }

  if (flags.send) {
    const result = await mail.sendSingle({
      to: { email, name: `${row.first_name} ${row.last_name}` },
      template: "invite",
      data: { firstName: row.first_name, accessType, accessCode: code, codeExpiresAt: expires, email },
    });
    if (!result.ok) fail(`The invite is saved, but the email failed: ${result.error}`);
    console.log(result.logged ? "ZOHO_API_KEY is not set: the invite email was printed above, not sent." : `Invite emailed to ${email}. Zoho request id: ${result.id ?? "none"}`);
  }
}

main().catch((error) => fail(String(error)));
