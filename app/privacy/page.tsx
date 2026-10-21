import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/marketing/site-footer";
import { SiteNav } from "../../components/marketing/site-nav";
import { APP_NAME, contactEmail } from "../../lib/config";

export const metadata: Metadata = { title: `Privacy · ${APP_NAME}` };

// The privacy policy of the hosted instance (D-035): what is collected, why, who processes it, and members'
// rights. The AI provider behind credits isn't named (D-034). Self-hosted instances set their own policy.

export default function Privacy() {
  const contact = contactEmail();
  const write = contact ? <a href={`mailto:${contact}`}>{contact}</a> : <>us by replying to any email from {APP_NAME}</>;

  return (
    <div className="theme-light showroom">
      <SiteNav />
      <main className="wrap terms">
      <h1 className="display display-sm">Privacy</h1>
      <p className="terms-updated">Last updated 21 October 2026</p>

      <p>
        {APP_NAME} drafts LinkedIn posts in your voice and publishes only the posts you approve. This page explains what we
        collect to do that, who helps us process it, and what you can do about it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your account:</strong> email address, name, time zone, posting days and email preferences.</li>
        <li><strong>What you give us to write with:</strong> the posts you import or paste, your brief (profession, audience, goals, topics), and the voice profile we build from them.</li>
        <li><strong>Your drafts and calendar:</strong> every draft, its schedule, status and edits, and whether it was published.</li>
        <li><strong>LinkedIn access:</strong> the access token LinkedIn gives us when you connect, so we can post for you. It&apos;s stored encrypted.</li>
        <li><strong>Your own AI key</strong>, if you add one. It&apos;s stored encrypted and only its last four characters are ever shown.</li>
        <li><strong>Credits and payments:</strong> your balance, purchases, refunds and the amount of AI work each job used. Card details go to our payment provider and never reach us.</li>
        <li><strong>Security records:</strong> a scrambled (hashed) form of your IP address to limit repeated sign-in attempts, and the emails we&apos;ve sent you so we don&apos;t send the same one twice.</li>
      </ul>
      <p>We don&apos;t use advertising or tracking tools, and we don&apos;t sell your data.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To learn your voice, draft your posts and publish the ones you approve, at the times you choose.</li>
        <li>To sign you in, keep your account secure and stop abuse.</li>
        <li>To charge for credits, keep payment records and handle refunds.</li>
        <li>To email you about your account: sign-in codes, drafts ready for review, posts that failed, receipts and low credits. You can turn off the optional emails in Settings.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <ul>
        <li><strong>An AI model provider</strong> receives your imported posts, brief, voice profile and drafts to write and improve posts. If you use your own key, they go to the provider you chose, under that provider&apos;s terms.</li>
        <li><strong>LinkedIn</strong> receives the posts you approve, published to your profile.</li>
        <li><strong>Supabase</strong> stores our database and runs sign-in.</li>
        <li><strong>Cloudflare</strong> checks that sign-in and sign-up forms are used by people (Turnstile) and protects the site.</li>
        <li><strong>Zoho</strong> sends our emails.</li>
        <li><strong>Bachs</strong> processes credit payments.</li>
        <li>Our hosting provider runs the app.</li>
      </ul>
      <p>Some of these providers store or process data outside Nigeria. We only share what each one needs to do its job.</p>

      <h2>How we protect it</h2>
      <ul>
        <li><strong>LinkedIn access and AI keys are encrypted.</strong> Before we store your LinkedIn token or your own AI key, our server encrypts it with strong, industry-standard encryption. It&apos;s decrypted only on our server, at the moment we publish a post or run a job for you.</li>
        <li><strong>They never leave our server.</strong> Tokens and keys aren&apos;t shown on any page, sent to your browser or included in your data export. For your own key, only the last four characters are shown.</li>
        <li><strong>Your data is walled off.</strong> Database rules let each member read only their own rows. Tokens and keys can&apos;t be read through the app at all, not even by you; only our server can use them.</li>
        <li><strong>Admins don&apos;t see your content.</strong> Admin pages show account settings, counts and payment totals, never your posts, drafts, tokens or keys. Admin access is protected by extra sign-in checks.</li>
        <li><strong>No passwords to steal.</strong> You sign in with a one-time code sent to your email. Repeated attempts are limited.</li>
        <li><strong>Encrypted in transit.</strong> Traffic between you, our app and our providers uses HTTPS.</li>
        <li><strong>Access ends when you leave.</strong> When you disconnect LinkedIn or delete your data, we also ask LinkedIn to revoke our access.</li>
      </ul>
      <p>No system is perfectly secure. If a breach affects your data, we&apos;ll tell you and the regulator as the law requires.</p>

      <h2>Cookies</h2>
      <p>
        We use cookies only to keep you signed in, to keep admin sessions secure, and to remember whether you chose to see
        prices in naira or dollars. Cloudflare may set a cookie when it checks a form. There are no advertising cookies.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your posts, voice, drafts and LinkedIn connection stay until you delete them.</li>
        <li>Credit and payment records are kept while your account exists, and as long as the law requires for accounting.</li>
        <li>Posts already published stay on LinkedIn until you remove them there.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <ul>
        <li><strong>Download your data:</strong> Settings → Your data → Export gives you everything we hold about your posts, voice and calendar in one file.</li>
        <li><strong>Delete your data:</strong> Settings → Your data → Delete removes your imported posts, voice, calendars, drafts and LinkedIn connection at once. Your account stays so you can start again.</li>
        <li><strong>Close your account:</strong> write to {write} and we&apos;ll delete your account and everything left in it. Remaining credits are lost.</li>
        <li><strong>Disconnect LinkedIn</strong> at any time in Settings → Channels.</li>
        <li>You can also ask us to correct your data, or tell you what we hold, by writing to {write}. Under Nigeria&apos;s Data Protection Act you may complain to the Nigeria Data Protection Commission.</li>
      </ul>

      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows when it last changed. Read it together with our <Link href="/terms">Terms</Link>.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
