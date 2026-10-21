"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Icon, type IconName } from "../ui";

// The admin area's frame: its own sidebar and top bar, separate from the member workspace. Shared by the real
// admin pages and the preview; each passes its own base path and data. On phones: a slim top bar and the pages as
// scrolling pills, with no workspace tab bar. Admin accounts are admin only (D-032), so the real frame has no way
// into the workspace; the preview links back to its own.

export type AdminPageId = "overview" | "members" | "purchases" | "access" | "audit" | "admins";
export type AdminPageInfo = { id: AdminPageId; label: string; icon: IconName; tone: number; path: string };

/** Every admin page: its name, icon and colour (a pillar tone). Purchases exists only with billing on. */
export const ADMIN_PAGES: AdminPageInfo[] = [
  { id: "overview", label: "Overview", icon: "pulse", tone: 0, path: "" },
  { id: "members", label: "Members", icon: "list", tone: 5, path: "/members" },
  { id: "purchases", label: "Purchases", icon: "card", tone: 4, path: "/purchases" },
  { id: "access", label: "Access list", icon: "mail", tone: 3, path: "/access" },
  { id: "audit", label: "Audit log", icon: "clock", tone: 1, path: "/audit" },
  { id: "admins", label: "Admins", icon: "shield", tone: 2, path: "/admins" },
];

export type AdminFrameProps = {
  /** "/admin" or "/preview/admin": every admin link is built from it. */
  base: string;
  /** Where "Back to workspace" goes. Only the preview has one: admin accounts have no workspace (D-032). */
  workspace?: string;
  me: { name: string; email: string };
  billing: boolean;
  /** A strip above everything, such as the preview's sample-data note. */
  note?: ReactNode;
  /** Shows sign-out buttons that post here (ends the admin and Supabase sessions). */
  signOut?: string;
  children: ReactNode;
};

const pagesFor = (billing: boolean) => ADMIN_PAGES.filter((page) => billing || page.id !== "purchases");

function currentOf(pathname: string | undefined, base: string): AdminPageId | undefined {
  if (!pathname) return undefined;
  const rest = pathname.slice(base.length).replace(/^\/+/, "").split("/")[0];
  return (ADMIN_PAGES.find((page) => page.path === (rest ? `/${rest}` : ""))?.id) ?? "overview";
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

function Frame({ props, pathname }: { props: AdminFrameProps; pathname?: string }) {
  const { base, workspace, me, billing, signOut } = props;
  const pages = pagesFor(billing);
  const current = currentOf(pathname, base);
  const title = ADMIN_PAGES.find((page) => page.id === current)?.label ?? "Overview";
  return (
    <>
      <aside className="wr-sidebar wr-admin-sidebar" aria-label="Admin">
        <div className="wr-side-top">
          <Link href={base} className="wr-brand" aria-label="Admin overview"><span className="wr-mark" aria-hidden="true">Px</span><span className="wr-word">poxeet</span></Link>
          <span className="wr-admin-badge">Admin</span>
        </div>
        <nav className="wr-side-scroll" aria-label="Admin pages">
          <div className="wr-nav">
            <span className="wr-nav-head">This instance</span>
            {pages.map((page) => (
              <Link key={page.id} href={base + page.path} className="wr-nav-link wr-admin-nav-link" data-tone={page.tone} aria-current={current === page.id ? "page" : undefined}>
                <span className="wr-admin-nav-icon" aria-hidden="true"><Icon name={page.icon} size={14} /></span>
                <span className="wr-nav-label">{page.label}</span>
              </Link>
            ))}
          </div>
          {workspace && (
            <div className="wr-nav wr-nav-end">
              <Link href={workspace} className="wr-nav-link"><Icon name="chevron-left" size={16} /><span className="wr-nav-label">Back to workspace</span></Link>
            </div>
          )}
        </nav>
        <div className="wr-me">
          <span className="wr-avatar wr-avatar-initials" aria-hidden="true">{initials(me.name)}</span>
          <div className="wr-me-text"><span>{me.name}</span><span>{me.email}</span></div>
          {signOut && (
            <form action={signOut} method="post" className="wr-signout">
              <button type="submit" className="wr-icon-btn" aria-label="Sign out" title="Sign out"><Icon name="logout" size={16} /></button>
            </form>
          )}
        </div>
      </aside>

      <header className="wr-phone-top">
        <Link href={base} className="wr-brand" aria-label="Admin overview"><span className="wr-mark" aria-hidden="true">Px</span><span className="wr-word">poxeet</span></Link>
        <span className="wr-inline">
          <span className="wr-admin-badge">Admin</span>
          {signOut
            ? <form action={signOut} method="post"><button type="submit" className="wr-admin-back"><Icon name="logout" size={14} />Sign out</button></form>
            : workspace && <Link href={workspace} className="wr-admin-back"><Icon name="chevron-left" size={14} />Workspace</Link>}
        </span>
      </header>
      <nav className="wr-admin-tabs" aria-label="Admin pages">
        {pages.map((page) => (
          <Link key={page.id} href={base + page.path} data-tone={page.tone} aria-current={current === page.id ? "page" : undefined}>
            <span className="wr-admin-nav-icon" aria-hidden="true"><Icon name={page.icon} size={14} /></span>{page.label}
          </Link>
        ))}
      </nav>

      <div className="wr-main">
        <header className="wr-topbar">
          <div className="wr-crumbs">
            <Link href={base} className="wr-crumb">Admin</Link>
            <span aria-hidden="true">/</span>
            <span className="wr-crumb-current">{title}</span>
          </div>
          <div className="wr-topbar-end">
            <span className="wr-admin-instance"><span className="wr-status-dot" data-tone={billing ? "success" : "muted"} aria-hidden="true" />Billing {billing ? "on" : "off"}</span>
            {signOut
              ? <form action={signOut} method="post"><button type="submit" className="pxt-btn pxt-btn-secondary pxt-btn-sm"><Icon name="logout" size={14} /><span>Sign out</span></button></form>
              : workspace && <Link href={workspace} className="pxt-btn pxt-btn-secondary pxt-btn-sm"><Icon name="chevron-left" size={14} /><span>Back to workspace</span></Link>}
          </div>
        </header>
        <div className="wr-page wr-admin-page">{props.children}</div>
      </div>
    </>
  );
}

function CurrentFrame({ props }: { props: AdminFrameProps }) {
  return <Frame props={props} pathname={usePathname()} />;
}

export function AdminFrame(props: AdminFrameProps) {
  return (
    <div className="wr-shell" data-area="admin">
      {props.note}
      <div className="wr-app">
        <Suspense fallback={<Frame props={props} />}><CurrentFrame props={props} /></Suspense>
      </div>
    </div>
  );
}
