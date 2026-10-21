import type { ReactNode } from "react";
import { SiteNav } from "../marketing/site-nav";

/** The showroom frame for sign-in, sign-up, password reset and onboarding: sky background, one white card. */
export function AuthShell({ children, wide = false, nav = true }: { children: ReactNode; wide?: boolean; nav?: boolean }) {
  return (
    <div className="theme-light showroom">
      {nav && <SiteNav />}
      <main className="signin" data-nav={nav ? undefined : "none"}>
        <section className="signin-card" data-size={wide ? "wide" : undefined}>{children}</section>
      </main>
    </div>
  );
}

/** Card heading. `accent` is the serif italic phrase. */
export function AuthHeading({ title, accent, children }: { title: ReactNode; accent?: ReactNode; children?: ReactNode }) {
  return (
    <header className="signin-head">
      <h1 className="type-display-md">{title}{accent && <> <em>{accent}</em></>}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}
