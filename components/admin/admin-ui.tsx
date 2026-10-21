"use client";

import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AiSource } from "../../lib/admin/types";
import { Icon } from "../ui";
import { ADMIN_PAGES, type AdminPageId } from "./admin-frame";

// The admin pages' shared parts: page heads, member tags, usage bars, the side sheet and date formatting.

/** An admin page's title and summary, with its icon in its colour, and actions on the right. */
export function AdminHead({ page, children, actions }: { page: AdminPageId; children?: ReactNode; actions?: ReactNode }) {
  const info = ADMIN_PAGES.find((item) => item.id === page)!;
  return (
    <div className="wr-admin-head">
      <div className="wr-settings-page-head" data-tone={info.tone}>
        <span className="wr-settings-page-icon" aria-hidden="true"><Icon name={info.icon} size={20} /></span>
        <div>
          <h1 className="wr-title">{info.label}</h1>
          {children && <p className="wr-sub">{children}</p>}
        </div>
      </div>
      {actions && <div className="wr-actions">{actions}</div>}
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
const toneOf = (key: string) => [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;

/** Initials, name and email. */
export function MemberWho({ member }: { member: { name: string; email: string; you?: boolean } }) {
  return (
    <span className="wr-admin-who">
      <span className="wr-admin-initials" data-tone={toneOf(member.email)} aria-hidden="true">{initials(member.name)}</span>
      <span className="wr-admin-who-text">
        <strong>{member.name}{member.you && <span className="wr-muted"> (you)</span>}</strong>
        <span>{member.email}</span>
      </span>
    </span>
  );
}

const AI_LABEL: Record<AiSource, string> = { instance: "Instance key", credits: "Credits", own: "Own key", none: "No AI yet" };

/** How a member's AI is paid for: the first match in key resolution. */
export function AiTag({ member }: { member: { ai: AiSource; credits: number | null; creditsLow?: boolean } }) {
  return (
    <span className="wr-tag" data-kind={member.ai} data-low={(member.ai === "credits" && member.creditsLow) || undefined}>
      {member.ai === "credits" ? `${(member.credits ?? 0).toLocaleString("en-US")} credits` : AI_LABEL[member.ai]}
    </span>
  );
}

/** Today's instance-key calls against the member's daily cap. Only instance-key members are capped. */
export function UsageCell({ member }: { member: { ai: AiSource; usedToday: number; cap: number } }) {
  if (member.ai !== "instance") return <span className="wr-small wr-muted">Not capped</span>;
  const full = member.usedToday >= member.cap;
  return (
    <span className="wr-admin-usage" data-full={full || undefined}>
      <span>{full ? <b>At cap</b> : <b>{member.usedToday}</b>} <span className="wr-muted">of {member.cap} today</span></span>
      <span className="wr-admin-bar" role="img" aria-label={`${member.usedToday} of ${member.cap} AI calls today`}>
        <span style={{ width: `${Math.min(100, (member.usedToday / member.cap) * 100)}%` }} />
      </span>
    </span>
  );
}

export function StatusTag({ member }: { member: { status: "active" | "suspended" } }) {
  if (member.status === "suspended") return <span className="wr-tag" data-kind="suspended"><Icon name="pause" size={12} />Suspended</span>;
  return <span className="wr-tag" data-kind="active"><Icon name="check" size={12} strokeWidth={2.2} />Active</span>;
}

/** The side sheet used for editing a member and for inviting someone. */
export function AdminSheet({ title, sub, onClose, children, foot }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; foot: ReactNode }) {
  const id = useId();
  // Portals need the document: a sheet opened from the URL renders once the page is in the browser.
  const inBrowser = useSyncExternalStore(() => () => {}, () => true, () => false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!inBrowser) return null;
  return createPortal(
    <div className="wr-sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="wr-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="wr-sheet-head">
          <div>
            <h2 id={`${id}-title`} className="wr-h2">{title}</h2>
            {sub && <p className="wr-small wr-muted">{sub}</p>}
          </div>
          <button type="button" className="wr-icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="wr-sheet-body">{children}</div>
        <div className="wr-sheet-foot">{foot}</div>
      </div>
    </div>,
    document.querySelector(".wr-shell") ?? document.body,
  );
}

/** A labelled group inside a sheet. */
export function SheetSection({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="wr-admin-section">
      <div><h3 className="wr-admin-section-title">{title}</h3>{hint && <p className="wr-small wr-muted">{hint}</p>}</div>
      {children}
    </section>
  );
}

/** Dates in the admin's own time zone: "Today" or "18 Oct", and the time. `now` comes from the page, not the clock. */
export function formatWhen(iso: string, timeZone: string, now: number) {
  const date = new Date(iso);
  const dayKey = (value: Date) => value.toLocaleDateString("en-CA", { timeZone });
  const day = dayKey(date) === dayKey(new Date(now)) ? "Today" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });
  return { day, time: date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }), key: dayKey(date) };
}

export function shortDate(iso: string, timeZone = "UTC") {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });
}
