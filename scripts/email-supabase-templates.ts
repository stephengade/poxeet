// Renders the auth emails Supabase sends (sign-up confirmation and sign-in code) with the shared email layout,
// keeping Supabase's placeholders, into supabase/templates/. Paste each file into Supabase:
// Authentication > Emails > Templates ("Confirm signup" and "Magic Link"). Local `supabase start` reads them
// through supabase/config.toml.
//   pnpm email:supabase-templates
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderEmail } from "../lib/email/layout";
import { confirmSignup, signInCode } from "../lib/email/templates/auth";

const dir = join(process.cwd(), "supabase", "templates");
const files = [
  { file: "confirmation.html", content: confirmSignup({ code: "{{ .Token }}" }) },
  { file: "magic_link.html", content: signInCode({ code: "{{ .Token }}" }) },
];

for (const { file, content } of files) {
  writeFileSync(join(dir, file), renderEmail(content, "{{ .Email }}").html);
  console.log(`Wrote supabase/templates/${file} (subject: ${content.subject})`);
}
