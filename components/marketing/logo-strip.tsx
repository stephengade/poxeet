import type { CSSProperties } from "react";
import { siClaude, siCloudflare, siNextdotjs, siPostgresql, siSupabase, type SimpleIcon } from "simple-icons";

// The services Poxeet is built on, in greyscale until hovered. LinkedIn's mark isn't in simple-icons and its
// brand rules require the official file, which lives in public/brand/partners and is shown unmodified.
const BRANDS: SimpleIcon[] = [siClaude, siSupabase, siPostgresql, siNextdotjs, siCloudflare];

/** "Built on" strip under the hero. */
export function LogoStrip() {
  return (
    <section className="built-on" aria-label="Built on Claude, Supabase, PostgreSQL, Next.js, Cloudflare and LinkedIn">
      <span className="built-on-label">Built on</span>
      <ul className="built-on-list">
        {BRANDS.map((brand) => (
          <li key={brand.slug} className="built-on-item" style={{ "--brand-mark": `#${brand.hex}` } as CSSProperties}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={brand.path} /></svg>
            <span>{brand.title}</span>
          </li>
        ))}
        <li className="built-on-item">
          {/* eslint-disable-next-line @next/next/no-img-element -- LinkedIn's official logo file, shown as supplied */}
          <img src="/brand/partners/linkedin.png" alt="LinkedIn" width={90} height={22} className="built-on-linkedin" />
        </li>
      </ul>
    </section>
  );
}
