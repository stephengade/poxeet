"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { LinkedInLogo } from "../brand/channel-logos";
import { Icon, type IconName } from "../ui";

// The signed-in app frame: sidebar, top bar, and on phones a slim top bar with a bottom tab bar.
// Shared by the real app (/app, real data) and the UI preview (/preview, sample data); each passes its own data.

export type LinkedInState = "connected" | "expiring" | "disconnected";

/** First-run setup: how far along, and the next step that can be done now. */
export type SetupProgress = { done: number; total: number; next: { title: string; href: string } | null };

export type FrameProps = {
  /** "/app" or "/preview": every link is built from it. */
  base: string;
  me: { name: string; email: string; avatar?: string | null };
  drafts: number;
  linkedin: LinkedInState;
  paused: boolean;
  onTogglePause: () => void;
  /** Parts that only work once their feature exists. */
  features?: { search?: boolean; notifications?: boolean; newPost?: boolean };
  /** A strip above everything, such as the preview's sample-data note. */
  note?: ReactNode;
  /** Shows a sign-out button next to the account. */
  signOut?: boolean;
  /** While setup isn't finished: a Setup item with a badge, a next-step button, and on phones a floating one. */
  setup?: SetupProgress;
  /**
   * Billing on: a Credits item in the sidebar. `balance` is set when credits pay for the member's AI (no own key
   * or grant), and then the top bar shows it too; `low` is under about a week of drafts.
   */
  credits?: { balance: number | null; low: boolean };
  children: ReactNode;
};

type NavItem = { id: string; label: string; icon: IconName; href: string; count?: number; badge?: { text: string; tone?: "warning" } };

const TITLES: Record<string, string> = {
  home: "Home", calendar: "Calendar", drafts: "Drafts", history: "History", voice: "Voice", brief: "Brief",
  setup: "Setup", settings: "Settings", posts: "Post", import: "Import", credits: "Credits",
};

function sectionOf(pathname: string, base: string) {
  const rest = pathname.slice(base.length).replace(/^\/+/, "");
  if (!rest) return "home";
  const [first, second] = rest.split("/");
  if (first === "settings" && second === "credits") return "credits";
  return first === "review" ? "drafts" : first;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

function Avatar({ me, size = 32 }: { me: FrameProps["me"]; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- small avatar, local or from the profile
  if (me.avatar) return <img className="wr-avatar" src={me.avatar} alt="" width={size} height={size} />;
  return <span className="wr-avatar wr-avatar-initials" aria-hidden="true">{initials(me.name)}</span>;
}

function NavLink({ item, current, compact }: { item: NavItem; current?: string; compact?: boolean }) {
  const active = item.id === current || (item.id === "calendar" && current === "posts");
  return (
    <Link href={item.href} className="wr-nav-link" data-nav={item.id} aria-current={active ? "page" : undefined} aria-label={compact ? item.label : undefined} title={compact ? item.label : undefined}>
      <Icon name={item.icon} size={16} />
      {!compact && <span className="wr-nav-label">{item.label}</span>}
      {item.count ? <span className="wr-nav-count" aria-label={compact ? `${item.count}` : undefined}>{item.count}</span> : null}
      {item.badge && !compact ? <span className="wr-nav-count" data-tone={item.badge.tone}>{item.badge.text}</span> : null}
    </Link>
  );
}

const LINKEDIN_DOT: Record<LinkedInState, { tone: string; label: string }> = {
  connected: { tone: "success", label: "Connected" },
  expiring: { tone: "warning", label: "Reconnect soon" },
  disconnected: { tone: "muted", label: "Not connected" },
};

function Sidebar({ props, current, collapsed, onToggle }: { props: FrameProps; current?: string; collapsed: boolean; onToggle: () => void }) {
  const { base, drafts, linkedin, me, signOut, setup, credits } = props;
  const setupLeft = setup ? setup.total - setup.done : 0;
  const main: NavItem[] = [
    { id: "home", label: "Home", icon: "home", href: base },
    ...(setupLeft > 0 ? [{ id: "setup", label: "Setup", icon: "check" as IconName, href: `${base}/setup`, count: setupLeft }] : []),
    { id: "calendar", label: "Calendar", icon: "calendar", href: `${base}/calendar` },
    { id: "drafts", label: "Drafts", icon: "pencil", href: `${base}/drafts`, count: drafts },
    { id: "history", label: "History", icon: "clock", href: `${base}/history` },
  ];
  const studio: NavItem[] = [
    { id: "voice", label: "Voice", icon: "voice", href: `${base}/voice` },
    { id: "brief", label: "Brief", icon: "doc", href: `${base}/brief` },
  ];
  const dot = LINKEDIN_DOT[linkedin];
  return (
    <aside className="wr-sidebar" data-collapsed={collapsed || undefined} aria-label="Main">
      <div className="wr-side-top">
        <Link href={base} className="wr-brand" aria-label="Poxeet home"><span className="wr-mark" aria-hidden="true">Px</span>{!collapsed && <span className="wr-word">poxeet</span>}</Link>
        <button type="button" className="wr-icon-btn wr-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggle}><Icon name="sidebar" size={16} /></button>
      </div>
      <nav className="wr-side-scroll" aria-label="Workspace">
        <div className="wr-nav">
          {!collapsed && <span className="wr-nav-head">Workspace</span>}
          {main.map((item) => <NavLink key={item.id} item={item} current={current} compact={collapsed} />)}
        </div>
        <div className="wr-nav">
          {!collapsed && <span className="wr-nav-head">Studio</span>}
          {studio.map((item) => <NavLink key={item.id} item={item} current={current} compact={collapsed} />)}
        </div>
        <div className="wr-nav">
          {!collapsed && <span className="wr-nav-head">Channels</span>}
          <Link href={`${base}/settings/channels`} className="wr-nav-link" aria-label={collapsed ? `LinkedIn, ${dot.label.toLowerCase()}` : undefined}>
            <LinkedInLogo size={16} decorative />
            {!collapsed && <span className="wr-nav-label">LinkedIn</span>}
            <span className="wr-status-dot" data-tone={dot.tone} role="img" aria-label={dot.label} />
          </Link>
        </div>
        <div className="wr-nav wr-nav-end">
          {!collapsed && <span className="wr-nav-head">Account</span>}
          {credits && (
            <NavLink item={{
              id: "credits", label: "Credits", icon: "card", href: `${base}/settings/credits`,
              badge: credits.balance !== null ? { text: compactNumber(credits.balance), tone: credits.low ? "warning" : undefined } : undefined,
            }} current={current} compact={collapsed} />
          )}
          <NavLink item={{ id: "settings", label: "Settings", icon: "sliders", href: `${base}/settings/profile` }} current={current} compact={collapsed} />
        </div>
      </nav>
      <div className="wr-me">
        <Avatar me={me} />
        {!collapsed && <div className="wr-me-text"><span>{me.name}</span><span>{me.email}</span></div>}
        {signOut && !collapsed && (
          <form action="/auth/signout" method="post" className="wr-signout">
            <button type="submit" className="wr-icon-btn" aria-label="Sign out" title="Sign out"><Icon name="logout" size={16} /></button>
          </form>
        )}
      </div>
    </aside>
  );
}

/** The one thing to do next while setup isn't finished. Hidden on the page that step lives on. */
function NextStep({ setup, pathname, variant }: { setup?: SetupProgress; pathname?: string; variant: "bar" | "float" }) {
  if (!setup?.next || setup.done >= setup.total || pathname === setup.next.href) return null;
  return (
    <Link href={setup.next.href} className={variant === "bar" ? "wr-next-step" : "wr-next-fab"} aria-label={`Setup, ${setup.done} of ${setup.total} done. Next: ${setup.next.title}`}>
      <span className="wr-next-count" aria-hidden="true">{setup.done}/{setup.total}</span>
      <span className="wr-next-label">Next: {setup.next.title}</span>
      <Icon name="arrow-right" size={14} />
    </Link>
  );
}

const compactNumber = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

/** The credit balance, when credits pay for the member's AI: a link to Credits, amber when it's low. */
function CreditsChip({ base, credits, compact }: { base: string; credits?: FrameProps["credits"]; compact?: boolean }) {
  if (!credits || credits.balance === null) return null;
  const label = `${credits.balance.toLocaleString("en-US")} credits${credits.low ? ", running low" : ""}`;
  return (
    <Link href={`${base}/settings/credits`} className="wr-credits-chip" data-tone={credits.low ? "warning" : undefined} aria-label={label} title={label}>
      <Icon name="card" size={14} />
      <span>{compact ? compactNumber(credits.balance) : `${compactNumber(credits.balance)} credits`}</span>
    </Link>
  );
}

function PublishingToggle({ paused, onTogglePause }: Pick<FrameProps, "paused" | "onTogglePause">) {
  return (
    <button type="button" role="switch" aria-checked={!paused} className="wr-publish" onClick={onTogglePause}>
      <span className="wr-status-dot" data-tone={paused ? "warning" : "success"} aria-hidden="true" />
      {paused ? "Paused" : "Publishing on"}
    </button>
  );
}

function TopBar({ props, current, pathname }: { props: FrameProps; current?: string; pathname?: string }) {
  const { base, features = {} } = props;
  return (
    <header className="wr-topbar">
      <div className="wr-crumbs">
        <Link href={base} className="wr-crumb">Workspace</Link>
        <span aria-hidden="true">/</span>
        <span className="wr-crumb-current">{current ? TITLES[current] ?? "Home" : "Home"}</span>
      </div>
      <div className="wr-topbar-end">
        <NextStep setup={props.setup} pathname={pathname} variant="bar" />
        {features.search && (
          <label className="wr-search">
            <Icon name="search" size={15} />
            <input type="search" placeholder="Search posts" aria-label="Search posts" />
            <kbd>Ctrl K</kbd>
          </label>
        )}
        <CreditsChip base={base} credits={props.credits} />
        <PublishingToggle paused={props.paused} onTogglePause={props.onTogglePause} />
        {features.notifications && <button type="button" className="wr-icon-btn wr-bell" aria-label="Notifications, 1 new"><Icon name="bell" size={16} /><span aria-hidden="true" /></button>}
        {features.newPost && <Link href={`${base}/posts/new`} className="pxt-btn pxt-btn-primary pxt-btn-sm wr-new"><Icon name="plus" size={14} strokeWidth={2.2} /><span>New post</span></Link>}
      </div>
    </header>
  );
}

/** Phones: every page in the app, in a sheet that rises from the tab bar's More. */
function MoreSheet({ props, current, onClose }: { props: FrameProps; current?: string; onClose: () => void }) {
  const { base, drafts, linkedin, setup, credits, signOut, me } = props;
  const setupLeft = setup ? setup.total - setup.done : 0;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const items: Array<NavItem & { tone: number }> = [
    { id: "home", label: "Home", icon: "home", href: base, tone: 0 },
    { id: "calendar", label: "Calendar", icon: "calendar", href: `${base}/calendar`, tone: 1 },
    { id: "drafts", label: "Drafts", icon: "pencil", href: `${base}/drafts`, count: drafts, tone: 2 },
    { id: "history", label: "History", icon: "clock", href: `${base}/history`, tone: 4 },
    { id: "voice", label: "Voice", icon: "voice", href: `${base}/voice`, tone: 5 },
    { id: "brief", label: "Brief", icon: "doc", href: `${base}/brief`, tone: 3 },
    ...(setupLeft > 0 ? [{ id: "setup", label: "Setup", icon: "check" as IconName, href: `${base}/setup`, count: setupLeft, tone: 0 }] : []),
  ];
  const dot = LINKEDIN_DOT[linkedin];
  return (
    <div className="wr-more-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="wr-more" role="dialog" aria-modal="true" aria-label="All pages">
        <span className="wr-more-grip" aria-hidden="true" />
        <div className="wr-more-me"><Avatar me={me} size={40} /><span className="wr-more-me-text"><strong>{me.name}</strong><span>{me.email}</span></span>
          <button type="button" className="wr-icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <nav className="wr-more-grid" aria-label="Pages">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className="wr-more-item" data-tone={item.tone} aria-current={item.id === current || (item.id === "calendar" && current === "posts") ? "page" : undefined} onClick={onClose}>
              <span className="wr-more-icon" aria-hidden="true"><Icon name={item.icon} size={20} /></span>
              {item.label}
              {item.count ? <span className="wr-more-count">{item.count}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="wr-more-list">
          <Link href={`${base}/settings/channels`} className="wr-more-row" onClick={onClose}>
            <LinkedInLogo size={18} decorative /><span>LinkedIn</span><span className="wr-more-meta"><span className="wr-status-dot" data-tone={dot.tone} aria-hidden="true" />{dot.label}</span>
          </Link>
          {credits && (
            <Link href={`${base}/settings/credits`} className="wr-more-row" onClick={onClose}>
              <Icon name="card" size={18} /><span>Credits</span>{credits.balance !== null && <span className="wr-more-meta">{compactNumber(credits.balance)} left</span>}
            </Link>
          )}
          <Link href={`${base}/settings/profile`} className="wr-more-row" aria-current={current === "settings" ? "page" : undefined} onClick={onClose}>
            <Icon name="sliders" size={18} /><span>Settings</span><Icon name="chevron-right" size={16} />
          </Link>
          {signOut && (
            <form action="/auth/signout" method="post">
              <button type="submit" className="wr-more-row wr-more-signout"><Icon name="logout" size={18} /><span>Sign out</span></button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneBars({ props, current, pathname }: { props: FrameProps; current?: string; pathname?: string }) {
  const { base, drafts, me, features = {}, setup } = props;
  const setupLeft = setup ? setup.total - setup.done : 0;
  const [moreOpen, setMoreOpen] = useState(false);
  const onMorePage = ["history", "voice", "brief", "settings", "credits", "import"].includes(current ?? "");
  const tab = (id: string, label: string, icon: IconName, href: string, count?: number) => (
    <Link href={href} className="wr-tab" aria-current={current === id ? "page" : undefined}>
      <Icon name={icon} size={20} />{label}
      {count ? <span className="wr-tab-count" aria-label={`${count} ${id === "setup" ? "setup steps left" : "drafts"}`}>{count}</span> : null}
    </Link>
  );
  return (
    <>
      <header className="wr-phone-top">
        <Link href={base} className="wr-brand" aria-label="Poxeet home"><span className="wr-mark" aria-hidden="true">Px</span><span className="wr-word">poxeet</span></Link>
        <span className="wr-inline">
          <CreditsChip base={base} credits={props.credits} compact />
          <PublishingToggle paused={props.paused} onTogglePause={props.onTogglePause} />
          <Link href={`${base}/settings/profile`} aria-label={`${me.name}, settings`}><Avatar me={me} /></Link>
        </span>
      </header>
      <nav className="wr-tabbar" aria-label="Main">
        {tab("home", "Home", "home", base)}
        {tab("calendar", "Calendar", "calendar", `${base}/calendar`)}
        {features.newPost
          ? <Link href={`${base}/posts/new`} className="wr-tab-create" aria-label="New post"><Icon name="plus" size={20} strokeWidth={2.2} /></Link>
          : setupLeft > 0
            ? tab("setup", "Setup", "check", `${base}/setup`, setupLeft)
            : <Link href={`${base}/calendar?plan=1`} className="wr-tab-create" aria-label="Plan more weeks"><Icon name="plus" size={20} strokeWidth={2.2} /></Link>}
        {tab("drafts", "Drafts", "pencil", `${base}/drafts`, drafts)}
        <button type="button" className="wr-tab" aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={onMorePage ? "page" : undefined} onClick={() => setMoreOpen(true)}>
          <Icon name="menu" size={20} />More
        </button>
      </nav>
      {moreOpen && <MoreSheet props={props} current={current} onClose={() => setMoreOpen(false)} />}
      <NextStep setup={setup} pathname={pathname} variant="float" />
    </>
  );
}

function Frame({ props, pathname }: { props: FrameProps; pathname?: string }) {
  const current = pathname ? sectionOf(pathname, props.base) : undefined;
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <Sidebar props={props} current={current} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      <PhoneBars props={props} current={current} pathname={pathname} />
      <div className="wr-main">
        <TopBar props={props} current={current} pathname={pathname} />
        {props.paused && (
          <div className="wr-paused" role="status">
            <Icon name="pause" size={14} />All publishing is paused. Approved posts wait until you turn it back on.
            <button type="button" onClick={props.onTogglePause}>Resume</button>
          </div>
        )}
        <Suspense fallback={<div className="wr-loading" aria-busy="true" />}>{props.children}</Suspense>
      </div>
    </>
  );
}

// The URL is only known at request time, so the frame streams in; it renders without a highlight first.
function CurrentFrame({ props }: { props: FrameProps }) {
  return <Frame props={props} pathname={usePathname()} />;
}

export function WorkroomFrame(props: FrameProps) {
  return (
    <div className="wr-shell">
      {props.note}
      <div className="wr-app">
        <Suspense fallback={<Frame props={props} />}><CurrentFrame props={props} /></Suspense>
      </div>
    </div>
  );
}
