"use client";

import { useState } from "react";
import type { AdminAuditEntry, AuditKind } from "../../lib/admin/types";
import { EmptyState, Icon, type IconName } from "../ui";
import { AdminHead, formatWhen } from "./admin-ui";

// Audit log: every change an admin made, who made it and when (PRD ADM-1). Read only; nothing here edits it.

const FILTERS: Array<[AuditKind | "all", string]> = [["all", "All"], ["access", "Access"], ["ai", "AI"], ["credits", "Credits"], ["account", "Accounts"], ["admins", "Admins"]];
const KIND_ICON: Record<AuditKind, IconName> = { access: "mail", ai: "sparkle", credits: "card", account: "pause", admins: "shield" };

function dayLabel(iso: string, timeZone: string, now: number) {
  const when = formatWhen(iso, timeZone, now);
  return when.day === "Today" ? "Today" : new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone });
}

export function AuditView({ entries, timeZone, now }: { entries: AdminAuditEntry[]; timeZone: string; now: number }) {
  const [filter, setFilter] = useState<AuditKind | "all">("all");
  const rows = entries.filter((entry) => filter === "all" || entry.kind === filter);
  const days = [...new Set(rows.map((entry) => formatWhen(entry.at, timeZone, now).key))];

  return (
    <>
      <AdminHead page="audit" actions={
        <div className="wr-filter" role="group" aria-label="Show">
          {FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
        </div>
      }>
        Every change an admin makes, who made it and when. It can&apos;t be edited or deleted.
      </AdminHead>

      {days.length === 0 ? (
        <div className="wr-card"><EmptyState title="Nothing here yet" icon="clock">Changes show here as soon as an admin makes one.</EmptyState></div>
      ) : days.map((day) => {
        const items = rows.filter((entry) => formatWhen(entry.at, timeZone, now).key === day);
        return (
          <section key={day} className="wr-card wr-table-card" aria-label={dayLabel(items[0].at, timeZone, now)}>
            <div className="wr-table-month">{dayLabel(items[0].at, timeZone, now)}</div>
            <ul className="wr-admin-feed">
              {items.map((entry) => (
                <li key={entry.id} data-kind={entry.kind}>
                  <span className="wr-admin-feed-when"><span className="wr-mono">{formatWhen(entry.at, timeZone, now).time}</span></span>
                  <span className="wr-admin-feed-icon" data-kind={entry.kind} aria-hidden="true"><Icon name={KIND_ICON[entry.kind]} size={14} /></span>
                  <span className="wr-admin-feed-what"><strong>{entry.text}</strong>{entry.detail && <span>{entry.detail}</span>}</span>
                  <span className="wr-admin-feed-who wr-small wr-muted">by {entry.actor}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {entries.length >= 200 && <p className="wr-small wr-muted">Showing the latest 200 changes.</p>}
    </>
  );
}
