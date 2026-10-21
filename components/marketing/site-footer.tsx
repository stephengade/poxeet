import Link from "next/link";
import { APP_NAME, REPO_URL } from "../../lib/config";
import { Logo } from "../brand/logo";

// The footer of every showroom page (landing, pricing, about, terms, privacy). Links to landing sections use
// "/#…" so they work from any page.

const GITHUB_HREF = REPO_URL ?? "/#open-source";

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-top">
        <div className="footer-brand">
          <Link href="/" className="footer-logo" aria-label={`${APP_NAME} home`}><Logo size={26} /></Link>
          <p>LinkedIn posts in your own voice. You approve every one.</p>
        </div>
        <nav className="footer-cols" aria-label="Footer">
          <div>
            <span className="footer-col-title">Product</span>
            <Link href="/#product">Product</Link>
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/#trust">Trust</Link>
            <Link href="/pricing">Pricing</Link>
          </div>
          <div>
            <span className="footer-col-title">Company</span>
            <Link href="/about">About</Link>
            <Link href={GITHUB_HREF}>GitHub</Link>
            <Link href="/#open-source">Self-hosting</Link>
            <Link href="/#faq">FAQ</Link>
          </div>
          <div>
            <span className="footer-col-title">Account</span>
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Get started</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </nav>
      </div>
      <div className="wrap footer-bottom">
        <span>© 2026 {APP_NAME} · Apache 2.0 license</span>
        <span>Not affiliated with LinkedIn.</span>
      </div>
      <div className="wrap footer-mark" aria-hidden="true">{APP_NAME.toLowerCase()}</div>
    </footer>
  );
}
