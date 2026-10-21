import { Suspense, type CSSProperties } from "react";
import { Bento } from "../components/marketing/bento";
import { HeroProduct } from "../components/marketing/hero-product";
import { HostedPricing, HostedPricingFallback } from "../components/marketing/hosted-pricing";
import { LogoStrip } from "../components/marketing/logo-strip";
import { Reveal } from "../components/marketing/motion";
import { PostWall } from "../components/marketing/post-wall";
import { SAMPLE_AUTHOR } from "../components/marketing/sample-calendar";
import { CurrencyCorner, NavCurrency } from "../components/marketing/currency-corner";
import { SiteFooter } from "../components/marketing/site-footer";
import { SiteNav } from "../components/marketing/site-nav";
import { VoiceCompare } from "../components/marketing/voice-compare";
import { Badge, Button } from "../components/ui";
import { APP_NAME, REPO_URL } from "../lib/config";

// GitHub buttons always show. Until NEXT_PUBLIC_REPO_URL is set they point at the self-hosting section.
const GITHUB_HREF = REPO_URL ?? "#open-source";

const WEEK = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16", "Sat 17", "Sun 18"];

// Product facts and targets from the PRD. No invented metrics.
const FACTS = [
  ["30", "min", "From sign-up to an approved month"],
  ["10", "min", "A week of review, after setup"],
  ["0", "", "Posts published without your approval"],
  ["60", "days", "Your only chore: reconnect LinkedIn"],
];

const TRUST = [
  ["Approval first", "The publisher only claims posts you approved, and Pause all stops it at once."],
  ["Only you see your data", "Row-level security ties every row to its owner. Admins never see your posts."],
  ["Keys stay encrypted", "Your Claude key is stored encrypted. You only ever see its last four characters."],
  ["Leave any time", "Delete your data from Settings in one step. Or run your own copy."],
];

const FAQ = [
  ["Will it ever post something I haven't approved?", "No. Only approved posts are published, and Pause all in the top bar stops everything at once. Edit an approved post and it comes back for review."],
  ["Is it safe for my LinkedIn account?", "Poxeet posts through LinkedIn's official API with the permission you grant when you connect. It doesn't scrape, automate your browser, comment or message anyone."],
  ["Where do my past posts come from?", "From the Shares file in your LinkedIn data export, or from posts you paste in. Those are sent to the AI that learns your voice and drafts your posts."],
  ["Which AI writes the drafts?", "With your own key, the provider you choose: Claude, OpenAI or DeepSeek. With Poxeet credits, our own AI setup, tuned for writing LinkedIn posts in your voice."],
  ["Can it post to a company page?", "Not yet. This version posts text to your personal profile."],
  ["What happens when LinkedIn disconnects?", "LinkedIn access lasts about 60 days. You get an email seven days before, and until you reconnect you can still copy any post and share it yourself."],
];

const rise = (index: number) => ({ "--i": index }) as CSSProperties;

function Eyebrow({ children }: { children: string }) {
  return <span className="eyebrow">{children}</span>;
}

export default function Home({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  return (
    <div className="theme-light showroom">
      <SiteNav currency={<NavCurrency />} />
      <CurrencyCorner />

      <header className="hero">
        <div className="hero-sky" aria-hidden="true">
          <span className="hero-bloom" />
          <span className="hero-dawn" />
          <span className="hero-ring hero-ring-1" />
          <span className="hero-ring hero-ring-2" />
          <span className="hero-week">{WEEK.map((day) => <span key={day}>{day}</span>)}</span>
        </div>

        <div className="wrap hero-copy">
          <a className="hero-pill rise" style={rise(0)} href="#open-source"><span>New</span>Now open source under Apache 2.0</a>
          <h1 className="hero-title rise" style={rise(1)}><span className="hero-line">LinkedIn posts that</span> <em className="hero-line">sound like you.</em></h1>
          <p className="hero-lede rise" style={rise(2)}>{APP_NAME} learns your voice from your past posts, drafts a month ahead and publishes only what you approve.</p>
          <div className="hero-actions rise" style={rise(3)}>
            <Button href="/signup" size="lg">Get started</Button>
            <Button href="#open-source" size="lg" variant="secondary" className="btn-glass">Self-host it</Button>
          </div>
          <span className="hero-note rise" style={rise(4)}>Ten minutes of review a week · Nothing posts without your approval</span>
        </div>

        <div className="hero-stage rise" id="product" style={rise(5)}>
          <div className="hero-float hero-float-voice" aria-hidden="true">
            <span className="hero-float-label">Voice profile · v1</span>
            <span className="hero-traits"><span>Direct</span><span>Warm</span><span>Short lines</span><span>Ends on a question</span><s>Hashtags</s></span>
          </div>
          <div className="hero-float hero-float-draft" aria-hidden="true">
            <span className="hero-float-status"><span className="pulse" />Drafting Friday · 09:00</span>
            <span>We shipped the boring version first. No animations. No onboarding tour. A form and a button<span className="caret" /></span>
          </div>
          <div className="hero-frame"><HeroProduct /></div>
        </div>

        <LogoStrip />
      </header>

      <main>
        <section className="section statement-section" aria-label={`Why ${APP_NAME}`}>
          <Reveal as="p" className="wrap statement">
            You know you should post. <span>The blank box wins anyway.</span> {APP_NAME} turns your past posts into <span>a voice,</span> your voice into <span>a month,</span> and the month into <span>ten minutes of review a week.</span>
          </Reveal>
        </section>

        <section className="wall-section" aria-labelledby="wall-heading">
          <div className="wrap wall-head">
            <h2 id="wall-heading" className="display display-sm">A month of drafts, <em>one voice.</em></h2>
            <span className="muted">Sample drafts for {SAMPLE_AUTHOR.name}, a fictional product lead</span>
          </div>
          <PostWall />
        </section>

        <section className="wrap section" aria-labelledby="features-heading">
          <Reveal className="section-head section-head-split">
            <div>
              <Eyebrow>What Poxeet does</Eyebrow>
              <h2 id="features-heading" className="display">Your ghostwriter, <em>with a calendar.</em></h2>
            </div>
            <p className="lede">Drafting, planning and posting in one calm place. You stay in charge of every word.</p>
          </Reveal>
          <Bento />
        </section>

        <section className="wrap section" id="how-it-works" aria-labelledby="how-heading">
          <Reveal className="section-head section-head-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 id="how-heading" className="display">Set up once. <em>Review in minutes.</em></h2>
            <p className="lede">From sign-up to an approved month in about half an hour, not counting LinkedIn&apos;s export email.</p>
          </Reveal>
          <div className="steps">
            <Reveal className="step">
              <div className="step-visual" aria-hidden="true" inert>
                <div className="sv-file">
                  <div className="sv-file-head"><span className="sv-file-icon" /><span><span className="mono">Shares.csv</span><span className="muted">LinkedIn data export</span></span></div>
                  <span className="sv-file-bar" />
                  <Badge status="posted">48 posts found · sample</Badge>
                </div>
              </div>
              <div className="step-copy"><span className="mono muted">01</span><h3>Bring your past posts</h3><p>Upload the Shares file from your LinkedIn export, or paste posts. Connect LinkedIn now or later.</p></div>
            </Reveal>
            <Reveal className="step step-raised" delay={90}>
              <div className="step-visual step-rings" aria-hidden="true" inert>
                <span /><span /><span /><span />
                <span className="sv-confirm">Looks like me</span>
              </div>
              <div className="step-copy"><span className="mono muted">02</span><h3>Check your voice</h3><p>Fill in a short brief, read the voice profile {APP_NAME} wrote, change anything that&apos;s off, then confirm.</p></div>
            </Reveal>
            <Reveal className="step" delay={180}>
              <div className="step-visual" aria-hidden="true" inert>
                <div className="sv-week">
                  {[["Mon", "Your roadmap is a list of bets."], ["Wed", "What I stopped doing in one-to-ones."], ["Fri", "A small story about a big launch."]].map(([day, text]) => (
                    <div key={day} className="sv-week-row"><span className="mono muted">{day}</span><span>{text}</span><Badge status="approved"><span className="pxt-sr">Approved</span></Badge></div>
                  ))}
                  <span className="sv-approve">Approve this week</span>
                </div>
              </div>
              <div className="step-copy"><span className="mono muted">03</span><h3>Approve the month</h3><p>Review a week at a time or one draft after another. Approved posts go out on their own.</p></div>
            </Reveal>
          </div>
          <dl className="facts">
            {FACTS.map(([value, unit, label]) => (
              <Reveal key={label} className="fact">
                <dt>{label}</dt>
                <dd>{value}{unit && <span> {unit}</span>}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        <section className="wrap section" aria-labelledby="voice-heading">
          <Reveal className="section-head section-head-split">
            <div>
              <Eyebrow>The difference</Eyebrow>
              <h2 id="voice-heading" className="display">Same idea. <em>Your words.</em></h2>
            </div>
            <p className="lede">Generic AI sounds like nobody in particular. {APP_NAME} drafts from how you already write.</p>
          </Reveal>
          <VoiceCompare />
        </section>

        <section className="wrap section" id="trust" aria-labelledby="trust-heading">
          <Reveal className="trust">
            <div className="trust-head">
              <Eyebrow>Trust</Eyebrow>
              <h2 id="trust-heading" className="display display-sm">It writes under your name. <em>So you hold the keys.</em></h2>
              <p className="lede">Every safeguard is built into the database and the publisher, not left to good intentions.</p>
            </div>
            <div className="trust-grid">
              {TRUST.map(([title, text], index) => (
                <div key={title} className="trust-item">
                  <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="wrap section" id="open-source" aria-labelledby="pricing-heading">
          <Reveal className="section-head section-head-center" >
            <Eyebrow>Open source · Apache 2.0</Eyebrow>
            <h2 id="pricing-heading" className="display">Run your own copy, <em>or use the hosted one.</em></h2>
          </Reveal>
          <div className="plans" id="pricing">
            <Reveal className="plan plan-dark">
              <h3>Self-hosted</h3>
              <span className="plan-price">Free</span>
              <p>The full app on your own servers and keys. Billing stays off.</p>
              <pre className="plan-terminal"><code>{`$ git clone ${REPO_URL ?? "<repository-url>"} poxeet\n$ cd poxeet && pnpm install\n$ cp .env.example .env.local\n$ pnpm dev`}</code></pre>
              <Button href={GITHUB_HREF} size="lg">Get it on GitHub</Button>
            </Reveal>
            <Reveal className="plan plan-light" delay={90}>
              <h3>Hosted</h3>
              <Suspense fallback={<HostedPricingFallback />}><HostedPricing searchParams={searchParams} /></Suspense>
              <Button href="/signup" size="lg">Create an account</Button>
            </Reveal>
          </div>
        </section>

        <section className="wrap section" id="faq" aria-labelledby="faq-heading">
          <div className="faq">
            <Reveal className="faq-head">
              <Eyebrow>Questions</Eyebrow>
              <h2 id="faq-heading" className="display display-sm">Before you <em>hand it the keys.</em></h2>
            </Reveal>
            <Reveal className="faq-list">
              {FAQ.map(([question, answer], index) => (
                <details key={question} className="faq-item" open={index === 0}>
                  <summary><span>{question}</span><span className="faq-toggle" aria-hidden="true" /></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="wrap section" aria-labelledby="cta-heading">
          <Reveal className="cta">
            <div className="cta-sky" aria-hidden="true"><span /><span /></div>
            <h2 id="cta-heading" className="display cta-title">A month of posts, <em>approved before lunch.</em></h2>
            <p className="lede">Import your posts, check your voice and approve the drafts. {APP_NAME} handles the rest.</p>
            <div className="hero-actions">
              <Button href="/signup" size="lg">Get started</Button>
              <Button href={GITHUB_HREF} size="lg" variant="secondary" className="btn-outline-brand">View on GitHub</Button>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
