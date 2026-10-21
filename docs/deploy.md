# Deploy runbook · hosted Poxeet

The steps to put the hosted instance live, in order, then the checks to run on it. Tick each box as you go. Secrets go in the host's environment settings, never in the repository.

## 1. Before you start

- [ ] Everything you want live is committed on the branch you'll deploy.
- [ ] Every migration is on the hosted project: `supabase migration list --db-url "<hosted DB URL>"` shows no local-only rows. If some are missing: `supabase db push --db-url "<hosted DB URL>"` (add `--include-all` only when it asks to insert an older one).
- [ ] You know the production domain (below, `https://poxeet.example`). It's proxied through Cloudflare.

## 2. Environment variables

Set these on the host (Vercel project settings, or the VPS's `.env`). `.env.example` explains each one.

**Required**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The hosted project's URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key |
| `SUPABASE_SECRET_KEY` | The project's secret key. Server only |
| `APP_URL` | `https://poxeet.example`, no trailing slash. Email links and Bachs return links use it |
| `ENCRYPTION_KEY` | A **new** 32-byte base64 key for production. Never change it once members save keys or connect LinkedIn |
| `ADMIN_SECRET` | 32+ random characters. Changing it later invalidates every admin code and session |
| `CRON_SECRET` | A long random hex string. The scheduler sends it |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | From Cloudflare Turnstile, for the production domain. Not the test keys |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | From the LinkedIn developer app |
| `ZOHO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | Zoho send-mail token and sender |
| `AI_PROVIDER` and its key (`DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY`) | The shared key that credits and instance-key members use. Which one is a business secret (D-034) |

**Billing** (credits for sale)

| Variable | Value |
|---|---|
| `BILLING_ENABLED` | `true` |
| `BACHS_API_KEY` | `sk_live_…` for real payments (`sk_sandbox_…` to rehearse) |
| `BACHS_WEBHOOK_SECRET` | From the Bachs webhook you register in step 6 |

**Optional:** `CONTACT_EMAIL` (shown on `/privacy`, defaults to `EMAIL_FROM`; set it before building, since that page is built once), `EMAIL_REPLY_TO`, `CREDIT_MARGIN` (default 6), `STARTER_CREDITS` (default 50), `MODEL_DEEPSEEK` / `MODEL_ANTHROPIC`. Leave `PRICING_COUNTRY` unset in production: it overrides every visitor's country.

Generate random values with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3. Supabase Auth (hosted project dashboard)

- [ ] **URL Configuration:** Site URL `https://poxeet.example`. Sign-in uses emailed codes, so no callback URL is needed.
- [ ] **Email templates:** paste `supabase/templates/magic_link.html` and `confirmation.html` into the Magic Link and Confirm Signup templates. Both show the 6-digit `{{ .Token }}`, not a link.
- [ ] **SMTP:** set custom SMTP (for example Zoho's SMTP with the Poxeet sender). Supabase's built-in sender only allows a few emails an hour, which blocks sign-ins at launch.
- [ ] **Auth hook:** Before User Created → `public.before_user_created` (enforces invite-only sign-up when it's on).
- [ ] **Captcha:** leave Supabase's own captcha **off**. The app checks Turnstile itself.

## 4. LinkedIn developer app

- [ ] Products: "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect".
- [ ] Authorized redirect URL: `https://poxeet.example/api/linkedin/callback`.
- [ ] Privacy policy URL: `https://poxeet.example/privacy`.

## 5. Deploy the app

**Vercel:** import the repository, set the variables from step 2, deploy. Add the domain and keep its Cloudflare record proxied; Cloudflare's `cf-ipcountry` header then picks naira for Nigeria.

**VPS:** `pnpm install --frozen-lockfile && pnpm build && pnpm start` behind a reverse proxy, with the domain proxied through Cloudflare so `cf-ipcountry` reaches the app. Keep the process running with a service manager (systemd or pm2).

## 6. Payments (Bachs)

- [ ] Register the webhook `https://poxeet.example/api/billing/webhook` for `collection.succeeded` and `refund.paid`. Put its secret in `BACHS_WEBHOOK_SECRET` and redeploy.
- [ ] Check the packs: `pnpm packs list` (with the hosted keys in `.env`) shows the dollar packs from $5 and the naira packs from ₦3,000.

## 7. Scheduler (cron-job.org)

Both jobs send the header `Authorization: Bearer <CRON_SECRET>`.

- [ ] `POST https://poxeet.example/api/cron/publish` every 15 minutes.
- [ ] `POST https://poxeet.example/api/cron/daily` once a day.
- [ ] Run each once by hand: they answer `200`. A `401` means the secret doesn't match.

## 8. First admin

With the production `ADMIN_SECRET` and hosted Supabase keys in your local `.env`:

```bash
pnpm admin:create you@example.com "Your Name"
```

It prints a starting access code once. Sign in at `https://poxeet.example/admin/login` (email, emailed code, access code) and replace the code when asked. Admin accounts can't be member accounts, so post from a separate member email.

## 9. Test on the live site

Use two member accounts (A and B, different emails) and the admin account.

**Sign-in and access**
- [ ] A signs up: Turnstile shows, the 6-digit code arrives, onboarding opens.
- [ ] `/admin` as A gives a 404. The admin signs in with email, code and access code.
- [ ] Nothing of B's shows anywhere for A (calendar, drafts, voice, history).

**The main flow (A)**
- [ ] Import posts (LinkedIn Shares file or paste), voice is learned, brief saved.
- [ ] Generate a month: drafts appear week by week with progress.
- [ ] Edit, approve, reschedule and skip a draft. Bulk approve works.
- [ ] Connect LinkedIn, schedule one approved post a few minutes ahead, and see it published by the cron. History shows it as posted.
- [ ] Pause all stops publishing. Disconnect LinkedIn works.

**Credits and pricing**
- [ ] From a Nigerian connection, `/pricing` shows "From ₦3,000"; from elsewhere, "From $5". The ₦/$ switch at the top right changes the display.
- [ ] Buy the ₦3,000 pack from Nigeria: Bachs charges NGN, 200 credits arrive, the receipt email comes.
- [ ] Drafting with credits takes them off the balance. The low-credits email arrives once.

**Admin**
- [ ] Grant B the instance key and set a small cap: B is refused at the cap.
- [ ] Suspend B: B is signed out and AI and publishing stop. Restore B.
- [ ] Every change shows in the audit log. Purchases lists A's naira purchase.

**Emails and data**
- [ ] Drafts-ready and weekly-summary emails arrive. A failed post sends its email.
- [ ] Settings → Your data: export downloads a file; delete removes posts, voice and drafts and keeps the account.

## If something goes wrong

- **Sign-in codes don't arrive:** Supabase SMTP (step 3), then Zoho's sending logs.
- **LinkedIn connect fails:** the redirect URL in step 4 must match exactly, `https` included.
- **Credits don't arrive after paying:** the Bachs webhook URL and secret (step 6); the member's Credits page also re-checks the checkout on return.
- **Posts don't publish:** the cron jobs (step 7), then the post's reason in History.
- **Prices always in dollars from Nigeria:** the domain isn't proxied through Cloudflare, or `PRICING_COUNTRY` is set.
