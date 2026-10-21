"use client";

import Link from "next/link";
import { moneyTotals } from "../../lib/admin/format";
import type { AdminOverview } from "../../lib/admin/types";
import { Button, Icon } from "../ui";
import { AdminHead, formatWhen, MemberWho, shortDate } from "./admin-ui";

// Overview: how the instance is used, what needs a look, and the latest admin changes. Counts only.

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function OverviewView({ data, base, timeZone }: { data: AdminOverview; base: string; timeZone: string }) {
  const { now, members, invites, audit, callsByDay, earnings } = data;
  const onInstance = members.filter((member) => member.ai === "instance");
  const atCap = onInstance.filter((member) => member.usedToday >= member.cap);
  const callsToday = onInstance.reduce((sum, member) => sum + member.usedToday, 0);
  const suspended = members.filter((member) => member.status === "suspended").length;
  const joinedThisWeek = members.filter((member) => now - new Date(member.joined).getTime() < WEEK).length;
  const lowCredits = members.filter((member) => member.creditsLow && member.status === "active");
  const expired = invites.filter((invite) => invite.state === "expired");
  const published = members.reduce((sum, member) => sum + member.published30d, 0);
  const publishers = members.filter((member) => member.published30d > 0).length;
  const peak = Math.max(1, ...callsByDay.map((day) => day.calls));
  const total = callsByDay.reduce((sum, day) => sum + day.calls, 0);
  const attention = atCap.length + lowCredits.length + expired.length;

  return (
    <>
      <AdminHead page="overview" actions={<Button href={`${base}/access?invite=1`} icon="plus">Invite someone</Button>}>
        How this instance is being used. Counts only: members&apos; posts, voice and keys never show here.
      </AdminHead>

      <div className="wr-stats">
        <Link href={`${base}/members`} className="wr-stat">
          <span className="wr-stat-label">Members<span className="wr-stat-icon" data-tone="brand"><Icon name="list" size={17} /></span></span>
          <span className="wr-stat-value">{members.length}<small>{members.length === 1 ? "account" : "accounts"}</small></span>
          <span className="wr-stat-foot"><b>{joinedThisWeek}</b> joined this week{suspended ? <> · {suspended} suspended</> : null}</span>
        </Link>
        <Link href={`${base}/members?filter=instance`} className="wr-stat">
          <span className="wr-stat-label">Instance key today<span className="wr-stat-icon" data-tone="violet"><Icon name="sparkle" size={17} /></span></span>
          <span className="wr-stat-value">{callsToday}<small>AI calls</small></span>
          <span className="wr-stat-foot">{onInstance.length} {onInstance.length === 1 ? "member" : "members"}{atCap.length ? <> · <b data-tone="warning">{atCap.length} at cap</b></> : null}</span>
        </Link>
        <div className="wr-stat">
          <span className="wr-stat-label">Published, 30 days<span className="wr-stat-icon" data-tone="success"><Icon name="send" size={17} /></span></span>
          <span className="wr-stat-value">{published}<small>{published === 1 ? "post" : "posts"}</small></span>
          <span className="wr-stat-foot">From {publishers} {publishers === 1 ? "member" : "members"}</span>
        </div>
        {earnings && (
          <Link href={`${base}/purchases`} className="wr-stat">
            <span className="wr-stat-label">Earned, 30 days<span className="wr-stat-icon" data-tone="warning"><Icon name="card" size={17} /></span></span>
            <span className="wr-stat-value wr-admin-money">{moneyTotals(earnings.net)}<small>net</small></span>
            <span className="wr-stat-foot"><b>{earnings.purchases}</b> {earnings.purchases === 1 ? "purchase" : "purchases"}{Object.keys(earnings.refunded).length ? <> · {moneyTotals(earnings.refunded)} refunded</> : null}</span>
          </Link>
        )}
      </div>

      <div className="wr-admin-grid">
        <section className="wr-card wr-card-flush">
          <div className="wr-settings-card-head wr-settings-card-row">
            <div><h2 className="wr-h2">Your key, last 14 days</h2><p className="wr-sub wr-small">AI calls on the instance key, from grants and credits. {total.toLocaleString("en-US")} in all.</p></div>
          </div>
          <div className="wr-admin-chart" role="img" aria-label={`AI calls on the instance key per day for ${callsByDay.length} days; ${callsByDay.at(-1)?.calls ?? 0} today, ${peak} at most.`}>
            {callsByDay.map((day, index) => {
              const date = new Date(`${day.day}T00:00:00Z`);
              const full = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
              return (
                <span key={day.day} className="wr-admin-chart-col" title={`${full}: ${day.calls} calls`}>
                  <span className="wr-admin-chart-bar" data-today={index === callsByDay.length - 1 || undefined} style={{ height: `${Math.max(3, (day.calls / peak) * 100)}%` }} />
                  <span className="wr-admin-chart-day" aria-hidden="true">{full.slice(0, 1)}</span>
                </span>
              );
            })}
          </div>
        </section>

        <section className="wr-card wr-card-flush">
          <div className="wr-settings-card-head"><h2 className="wr-h2">Needs a look</h2></div>
          {attention ? (
            <ul className="wr-admin-attention">
              {atCap.map((member) => (
                <li key={member.id}>
                  <MemberWho member={member} />
                  <span className="wr-small">Hit today&apos;s cap of {member.cap} calls</span>
                  <Button size="sm" variant="secondary" href={`${base}/members?member=${member.id}`}>Review</Button>
                </li>
              ))}
              {lowCredits.map((member) => (
                <li key={member.id}>
                  <MemberWho member={member} />
                  <span className="wr-small">{(member.credits ?? 0).toLocaleString("en-US")} credits left, under a week of drafts</span>
                  <Button size="sm" variant="secondary" href={`${base}/members?member=${member.id}`}>Review</Button>
                </li>
              ))}
              {expired.map((invite) => (
                <li key={invite.email}>
                  <MemberWho member={invite} />
                  <span className="wr-small">Access code expired {invite.expires ? shortDate(invite.expires, timeZone) : ""}, not joined</span>
                  <Button size="sm" variant="secondary" href={`${base}/access`}>New code</Button>
                </li>
              ))}
            </ul>
          ) : <p className="wr-small wr-muted wr-admin-empty-note">Nothing right now. Members at their cap, low balances and expired invites show here.</p>}
        </section>
      </div>

      <section className="wr-card wr-card-flush">
        <div className="wr-settings-card-head wr-settings-card-row">
          <div><h2 className="wr-h2">Recent admin changes</h2></div>
          <Link href={`${base}/audit`} className="wr-link">Audit log<Icon name="arrow-right" size={14} /></Link>
        </div>
        {audit.length ? (
          <ul className="wr-admin-feed">
            {audit.map((entry) => {
              const when = formatWhen(entry.at, timeZone, now);
              return (
                <li key={entry.id}>
                  <span className="wr-admin-feed-when"><strong>{when.day}</strong><span className="wr-mono">{when.time}</span></span>
                  <span className="wr-admin-feed-what"><strong>{entry.text}</strong>{entry.detail && <span>{entry.detail}</span>}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="wr-small wr-muted wr-admin-empty-note">No changes yet. Grants, caps, invites and suspensions show here.</p>}
      </section>
    </>
  );
}
