import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "../../lib/config";
import { Logo } from "../brand/logo";
import { Button } from "../ui/button";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * Floating glass navigation pill, fixed to the top of the showroom pages. It hugs its content. Pages with prices
 * pass the ₦/$ switch as `currency`: on phones it sits in the pill, in place of Sign in (D-033); wider, the page's
 * own top-right switch shows instead.
 */
export function SiteNav({ currency }: { currency?: ReactNode }) {
  return (
    <header className="site-nav-wrap">
      <nav className="site-nav" aria-label="Main">
        <Link href="/" className="site-nav-logo" aria-label={`${APP_NAME} home`}><Logo size={24} /></Link>
        <div className="site-nav-links">
          {LINKS.map((link) => <a key={link.href} className="site-nav-link" href={link.href}>{link.label}</a>)}
        </div>
        <div className="site-nav-actions">
          {currency && <span className="site-nav-currency">{currency}</span>}
          <Link className="site-nav-link site-nav-signin" href="/login">Sign in</Link>
          <Button href="/signup">Get started</Button>
        </div>
      </nav>
    </header>
  );
}
