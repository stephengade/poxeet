import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/marketing/site-footer";
import { SiteNav } from "../../components/marketing/site-nav";
import { APP_NAME, contactEmail } from "../../lib/config";

export const metadata: Metadata = {
  title: `About · ${APP_NAME}`,
  description: `${APP_NAME} learns your voice from your past LinkedIn posts, drafts a month ahead and publishes only what you approve.`,
};

// About (D-036): what Poxeet is, why it exists and what it promises. Same plain layout as Terms and Privacy.

export default function About() {
  const contact = contactEmail();

  return (
    <div className="theme-light showroom">
      <SiteNav />
      <main className="wrap terms">
        <span className="eyebrow">About</span>
        <h1 className="display display-sm">Your voice on LinkedIn, <em>without the blank page.</em></h1>

        <p>
          Most professionals know what they want to say on LinkedIn. What&apos;s hard is saying it every week, in between
          real work, without it sounding like everyone else&apos;s AI posts. {APP_NAME} exists for that gap.
        </p>

        <h2>What {APP_NAME} does</h2>
        <ul>
          <li><strong>Learns your voice</strong> from posts you&apos;ve already written: your openings, your rhythm, the words you use and the ones you never would.</li>
          <li><strong>Plans a month ahead</strong> around your brief: who you write for, what you want to be known for, and the topics you care about.</li>
          <li><strong>Drafts every post in your voice</strong>, ready for you to edit, approve or skip.</li>
          <li><strong>Publishes only what you approve</strong>, at the times you choose, through LinkedIn&apos;s official API.</li>
        </ul>
        <p>Ten minutes of review a week replaces the hours of staring at an empty post box.</p>

        <h2>What we promise</h2>
        <ul>
          <li><strong>Nothing goes out without you.</strong> Only approved posts are published, and Pause all stops everything at once.</li>
          <li><strong>It sounds like you.</strong> Drafts follow your own voice and avoid the phrases that give AI writing away.</li>
          <li><strong>Your account is safe.</strong> {APP_NAME} never scrapes, automates your browser, comments or messages anyone.</li>
          <li><strong>Your data is yours.</strong> Export it or delete it from Settings at any time. Read how we handle it in our <Link href="/privacy">Privacy policy</Link>.</li>
          <li><strong>Fair, simple pricing.</strong> Free with your own AI key, or pay as you go with credits. No subscription. See <Link href="/pricing">Pricing</Link>.</li>
        </ul>

        <h2>Open source</h2>
        <p>
          {APP_NAME} is open source under the Apache 2.0 license. You can use the hosted version, or run your own copy on your own
          servers and keys. Details are on the <Link href="/#open-source">home page</Link>.
        </p>

        <h2>Talk to us</h2>
        <p>
          {contact ? <>Questions, ideas or problems: write to <a href={`mailto:${contact}`}>{contact}</a>.</> : <>Questions, ideas or problems: reply to any email from {APP_NAME}.</>}
          {" "}{APP_NAME} is not affiliated with LinkedIn.
        </p>

        <p><Link href="/signup">Get started</Link> · <Link href="/pricing">See pricing</Link></p>
      </main>
      <SiteFooter />
    </div>
  );
}
