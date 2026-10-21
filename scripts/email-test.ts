// Sends a real test email through Zoho with sample data.
//   pnpm email:test you@example.com [invite|linkedinExpiring|emptyNextWeek]
import { email, templates, type TemplateName } from "../lib/email";
import { SAMPLES } from "../lib/email/samples";

const [to, name = "invite"] = process.argv.slice(2);
const names = Object.keys(templates) as TemplateName[];

if (!to || !names.includes(name as TemplateName)) {
  console.error(`Usage: pnpm email:test <to> [${names.join("|")}]`);
  process.exit(1);
}
if (!process.env.ZOHO_API_KEY) console.warn("ZOHO_API_KEY is not set: the email is printed below, not sent.");

// One async function: tsx runs this file as CommonJS, where top-level await isn't allowed.
async function main() {
  const template = name as TemplateName;
  const result = await email.sendSingle({ to, template, data: SAMPLES[template] as never });
  if (result.ok) console.log(result.logged ? "Logged, not sent." : `Sent "${template}" to ${to}. Zoho request id: ${result.id ?? "none"}`);
  else {
    console.error(`Not sent: ${result.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
