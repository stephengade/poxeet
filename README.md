# Poxeet

Poxeet drafts LinkedIn posts in your own voice. It learns your voice from posts you've already written, plans a month ahead around your brief, drafts every post, and publishes only the ones you approve, through LinkedIn's official API.

It's open source under the [Apache 2.0 license](LICENSE): fork it, extend it and build on it, commercially too. Use the hosted version, or run your own copy with your own keys. The product scope lives in [docs/prd.md](docs/prd.md).

## What's in it

- **Members:** email code sign-in, onboarding, post import (LinkedIn data export or paste), voice analysis, a brief, month plans drafted week by week, a calendar, a post editor, bulk approval, publishing to LinkedIn on schedule, Pause all, history, email notifications, and data export or deletion.
- **AI access:** members bring their own Claude, OpenAI or DeepSeek key, or use the operator's shared key, through an admin grant or prepaid credits.
- **Admin dashboard** at `/admin`: members, grants and caps, credits, suspension, the access list, purchases, the audit log and other admins. Admins are separate accounts with their own sign-in.
- **Optional billing:** credit packs sold through Bachs, in dollars, or in naira for visitors in Nigeria. Off unless `BILLING_ENABLED=true`.

Built with Next.js (App Router) and Supabase (Postgres with row-level security, and Auth).

## Run your own copy

You need Node.js 20+, pnpm, the [Supabase CLI](https://supabase.com/docs/guides/cli), a Supabase project, and a LinkedIn developer app.

1. **Install**

   ```bash
   pnpm install
   cp .env.example .env
   ```

   Fill in `.env`. Every variable is explained there. The app and the `pnpm` scripts below both read `.env`.

2. **Database:** apply every migration in `supabase/migrations` to your project:

   ```bash
   supabase db push --db-url "postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres"
   ```

3. **Supabase Auth** (project dashboard):
   - URL Configuration: set the Site URL to your app's address (`http://localhost:3000` locally).
   - Email templates: paste `supabase/templates/magic_link.html` and `confirmation.html` into the Magic Link and Confirm Signup templates. Sign-in uses the 6-digit code they show. Regenerate them with `pnpm email:supabase-templates` after changing the email layout.
   - For real use, set custom SMTP. Supabase's built-in sender only allows a few emails an hour.
   - Leave Supabase's own captcha off. The app checks Cloudflare Turnstile itself when its two keys are set.

4. **LinkedIn app:** add the products "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect", and register `<your address>/api/linkedin/callback` as a redirect URL.

5. **First admin**

   ```bash
   pnpm admin:create you@example.com "Your Name"
   ```

   It prints a starting access code once. Sign in at `/admin/login` with your email, the emailed code, then the access code, and choose your own. Admin accounts can't be member accounts, so use another email to post.

6. **Run it**

   ```bash
   pnpm dev
   ```

   Open `http://localhost:3000`. Sign-up is open by default. Switch it to invite only in Admin → Access list, or add people from the command line with `pnpm invite <email> <first name> <last name>`.

7. **Publishing** needs a scheduler. Send `POST /api/cron/publish` every 15 minutes and `POST /api/cron/daily` once a day, each with `Authorization: Bearer <CRON_SECRET>`. cron-job.org works, or any cron.

Billing stays off unless you set `BILLING_ENABLED=true` and the Bachs keys. Without it, members bring their own AI key, or you grant them your shared key in the admin dashboard.

To put a hosted instance live, follow [docs/deploy.md](docs/deploy.md). It covers every variable, the services to set up, and a test list for the live site.

## Development

```bash
pnpm dev                # the app on http://localhost:3000
pnpm lint
pnpm exec tsc --noEmit
pnpm test               # unit tests
pnpm test:db            # unit and database tests, against a local Supabase (supabase start)
```

- **Design system:** tokens in `design-tokens.json`. `pnpm tokens:build` regenerates `app/tokens.generated.css`, `pnpm logo:build` re-outlines the logo files, and `/design` shows every token and component.
- **Credit packs:** `pnpm packs list|add|edit|seed`.
- **Emails:** `pnpm email:test you@example.com` sends a real test email through Zoho. Without `ZOHO_API_KEY`, emails are printed to the console instead.

Keep real keys in `.env` files, which Git ignores. Never put a Supabase secret key in a `NEXT_PUBLIC_` variable.

## Contributing

Contributions are welcome: bug reports, ideas and pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Anything you contribute is licensed under Apache 2.0, like the rest of the project.

## Name and logo

The code is yours to fork and build on under the [Apache 2.0 license](LICENSE). The Poxeet name and logo are not part of that license: if you run or publish your own version, give it your own name and logo, and don't present it as Poxeet or as made by us.

## Responsibilities

Whoever runs an instance is responsible for following LinkedIn's platform rules, for securing their keys (especially `ENCRYPTION_KEY`, `ADMIN_SECRET` and the Supabase secret key), and for their own terms and privacy policy. Poxeet is not affiliated with LinkedIn.
