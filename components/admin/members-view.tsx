"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AdminActions, AdminAuditEntry, AdminMember, MemberChange } from "../../lib/admin/types";
import { Banner, Button, EmptyState, Icon, Switch } from "../ui";
import { AdminHead, AdminSheet, AiTag, formatWhen, MemberWho, SheetSection, shortDate, StatusTag, UsageCell } from "./admin-ui";

// Members: who has an account, how their AI is paid for and today's use of the instance key. Opening someone
// shows their counts and the settings an admin controls (PRD ADM-1).

const FILTERS = [["all", "All"], ["instance", "Instance key"], ["credits", "Credits"], ["own", "Own key"], ["suspended", "Suspended"]] as const;
type Filter = (typeof FILTERS)[number][0];

function matches(member: AdminMember, filter: Filter, query: string) {
  const q = query.trim().toLowerCase();
  if (q && !member.name.toLowerCase().includes(q) && !member.email.toLowerCase().includes(q)) return false;
  if (filter === "all") return true;
  if (filter === "suspended") return member.status === "suspended";
  return member.ai === filter;
}

type SheetProps = { member: AdminMember; history: AdminAuditEntry[]; billing: boolean; timeZone: string; now: number; actions: AdminActions; onClose: () => void };

function MemberSheet({ member, history, billing, timeZone, now, actions, onClose }: SheetProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [granted, setGranted] = useState(member.instanceKey);
  const [cap, setCap] = useState(String(member.cap));
  const [suspended, setSuspended] = useState(member.status === "suspended");
  const [grant, setGrant] = useState("");
  const [note, setNote] = useState("");
  const first = member.name.split(" ")[0];
  const capValue = Number(cap);
  const capValid = Number.isInteger(capValue) && capValue >= 1 && capValue <= 1000;
  const grantValue = grant.trim() ? Number(grant) : 0;
  const grantValid = !grant.trim() || (Number.isInteger(grantValue) && grantValue !== 0);

  function save() {
    if (!capValid || !grantValid) return;
    const change: MemberChange = {};
    if (granted !== member.instanceKey) change.instanceKey = granted;
    if (capValue !== member.cap) change.cap = capValue;
    if (suspended !== (member.status === "suspended")) change.suspended = suspended;
    start(async () => {
      if (Object.keys(change).length) {
        const result = await actions.updateMember(member.id, change);
        if (!result.ok) return void toast.error(result.message);
      }
      if (grantValue) {
        const result = await actions.grantCredits(member.id, grantValue, note);
        if (!result.ok) return void toast.error(result.message);
      }
      toast.success(Object.keys(change).length || grantValue ? `Saved ${first}'s settings.` : "Nothing changed.", { description: "Each change is in the audit log." });
      router.refresh();
      onClose();
    });
  }

  return (
    <AdminSheet
      title={member.name}
      sub={<>{member.email} · joined {shortDate(member.joined, timeZone)}</>}
      onClose={onClose}
      foot={<>
        <span className="wr-small wr-muted">Changes apply at once and are logged.</span>
        <span className="wr-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending} disabled={!capValid || !grantValid}>Save changes</Button></span>
      </>}
    >
      <dl className="wr-admin-facts">
        <div><dt>AI right now</dt><dd><AiTag member={member} /></dd></div>
        <div><dt>Last AI job</dt><dd>{member.lastJob ? (({ day, time }) => `${day}, ${time}`)(formatWhen(member.lastJob, timeZone, now)) : "None yet"}</dd></div>
        <div><dt>AI calls, 7 days</dt><dd>{member.calls7d}</dd></div>
        <div><dt>Published, 30 days</dt><dd>{member.published30d} {member.published30d === 1 ? "post" : "posts"}</dd></div>
      </dl>

      <SheetSection title="AI access" hint={member.ai === "own" ? "They use their own key, so the instance key and the cap don't apply until they remove it." : "With the instance key, their AI runs on your key at your cost. Without it, they need credits or their own key."}>
        <ul className="wr-toggles wr-admin-toggles">
          <li>
            <span><strong>Instance key</strong><span className="wr-small wr-muted">Free to them; you pay the provider.</span></span>
            <Switch aria-label="Instance key" checked={granted} onChange={setGranted} />
          </li>
        </ul>
        <label className="wr-field">Daily cap
          <input type="number" inputMode="numeric" min={1} max={1000} value={cap} onChange={(event) => setCap(event.target.value)} aria-describedby={`${member.id}-cap-hint`} />
          <span id={`${member.id}-cap-hint`} className={capValid ? "wr-field-hint" : "wr-field-error"}>
            {capValid
              ? `AI calls a day on the instance key, reset at midnight UTC.${member.ai === "instance" ? ` Used today: ${member.usedToday}.` : ""} One 8-week plan is about 60.`
              : "Enter a whole number from 1 to 1,000."}
          </span>
        </label>
      </SheetSection>

      {billing && (
        <SheetSection title="Credits" hint={<>Balance: <b>{(member.credits ?? 0).toLocaleString("en-US")} credits</b>. A grant adds free credits that expire in 3 months; a negative amount takes credits away.</>}>
          <div className="wr-two">
            <label className="wr-field">Amount
              <input type="number" inputMode="numeric" placeholder="e.g. 200" value={grant} onChange={(event) => setGrant(event.target.value)} aria-invalid={!grantValid || undefined} />
            </label>
            <label className="wr-field">Note
              <input type="text" placeholder="Why, for the log" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </div>
        </SheetSection>
      )}

      <SheetSection title="Account">
        <ul className="wr-toggles wr-admin-toggles">
          <li>
            <span><strong>Suspended</strong><span className="wr-small wr-muted">Signs them out. Publishing and AI stop; their data stays.</span></span>
            <Switch aria-label="Suspended" checked={suspended} onChange={setSuspended} />
          </li>
        </ul>
        {suspended && member.status !== "suspended" && (
          <Banner tone="warning" title={`${first} will be signed out`}>Approved posts stop going out until you lift the suspension.</Banner>
        )}
      </SheetSection>

      <SheetSection title="Changes to this member">
        {history.length ? (
          <ul className="wr-admin-feed wr-admin-feed-tight">
            {history.map((entry) => {
              const when = formatWhen(entry.at, timeZone, now);
              return (
                <li key={entry.id}>
                  <span className="wr-admin-feed-when"><strong>{when.day}</strong><span className="wr-mono">{when.time}</span></span>
                  <span className="wr-admin-feed-what"><strong>{entry.text}</strong>{entry.detail && <span>{entry.detail}</span>}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="wr-small wr-muted">No admin changes yet.</p>}
      </SheetSection>
    </AdminSheet>
  );
}

export function MembersView({ members, audit, billing, timeZone, now, actions }: { members: AdminMember[]; audit: AdminAuditEntry[]; billing: boolean; timeZone: string; now: number; actions: AdminActions }) {
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(FILTERS.find(([id]) => id === params.get("filter"))?.[0] ?? "all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(params.get("member"));
  const rows = members.filter((member) => matches(member, filter, query));
  const current = members.find((member) => member.id === open);
  const count = (id: Filter) => members.filter((member) => matches(member, id, "")).length;

  return (
    <>
      <AdminHead page="members">Who has an account, how their AI is paid for, and today&apos;s use of your key. Open someone to change their access.</AdminHead>

      <section className="wr-card wr-table-card">
        <div className="wr-admin-toolbar">
          <div className="wr-filter" role="group" aria-label="Show">
            {FILTERS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span className="wr-admin-filter-count">{count(id)}</span></button>
            ))}
          </div>
          <label className="wr-search wr-admin-search">
            <Icon name="search" size={15} />
            <input type="search" placeholder="Name or email" aria-label="Search members" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No one matches" icon="search">Try another name, or show everyone.</EmptyState>
        ) : (
          <ul className="wr-admin-list" aria-label="Members">
            <li className="wr-admin-list-head" aria-hidden="true"><span>Member</span><span>AI</span><span>Instance key today</span><span>Status</span><span /></li>
            {rows.map((member) => (
              <li key={member.id}>
                <button type="button" className="wr-admin-row" onClick={() => setOpen(member.id)} aria-label={`${member.name}, open settings`}>
                  <MemberWho member={member} />
                  <span className="wr-admin-cell-ai"><AiTag member={member} /></span>
                  <span className="wr-admin-cell-usage"><UsageCell member={member} /></span>
                  <span className="wr-admin-cell-status"><StatusTag member={member} /></span>
                  <Icon name="chevron-right" size={16} className="wr-admin-chevron" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="wr-small wr-muted">Caps count only calls on the instance key. Members on their own key or on credits pay for their own use.</p>

      {current && (
        <MemberSheet key={current.id} member={current} history={audit.filter((entry) => entry.targetId === current.id)} billing={billing} timeZone={timeZone} now={now} actions={actions} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
