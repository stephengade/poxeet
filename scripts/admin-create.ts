// Creates an admin from the command line (D-032): the first one, before anyone can invite from the dashboard, or a
// recovery when every admin has lost their code. Re-running for the same email resets their code.
//   pnpm admin:create <email> <name> [--code 40917253]
// Prints the starting code once. They sign up (or sign in) at /admin/signup and choose their own code.
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and ADMIN_SECRET from .env.
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { codeProblem, hashCode, newStartingCode } from "../lib/admin/code";
import { appUrl } from "../lib/config";

const USAGE = "Usage: pnpm admin:create <email> <name> [--code 40917253]";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: { code: { type: "string" } } });
const [rawEmail, ...nameParts] = positionals;
const email = rawEmail?.trim().toLowerCase();
const name = nameParts.join(" ").trim();
if (!email || !name) fail(USAGE);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("That isn't a valid email address.");
const code = flags.code ?? newStartingCode();
const problem = codeProblem(code);
if (problem) fail(`--code: ${problem}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.");
if ((process.env.ADMIN_SECRET ?? "").length < 32) fail("Set ADMIN_SECRET (32+ characters) in .env first; the app needs the same value.");

async function main() {
  const db = createClient(url!, key!, { auth: { persistSession: false } });
  const [{ data: member }, { data: existing }] = await Promise.all([
    db.from("profiles").select("id").eq("email", email).maybeSingle(),
    db.from("admins").select("id, user_id").eq("email", email).maybeSingle(),
  ]);
  if (member) fail("That email has a member account. Admin accounts are admin only: use a separate email (for example you+admin@...).");
  const code_hash = await hashCode(code);
  const { error } = existing
    ? await db.from("admins").update({ name, code_hash, must_change_code: true, status: existing.user_id ? "active" : "invited" }).eq("id", existing.id)
    : await db.from("admins").insert({ email, name, code_hash });
  if (error) fail(error.message);
  console.log(`${existing ? "Reset" : "Created"} admin ${name} <${email}>.`);
  console.log(`Starting code: ${code}  (shown once; they replace it at sign-in)`);
  console.log(`${existing?.user_id ? "Sign in" : "Sign up"} at: ${appUrl()}/admin/${existing?.user_id ? "login" : "signup"}`);
}

main().catch((error) => fail(String(error)));
