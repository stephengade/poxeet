import { appUrl } from "../../config";
import { actionPanel, footnote, heading, linkFallback, paragraph, type EmailContent } from "../layout";

// Notification emails (PRD section 8): most are sent by the daily cron (lib/digest.ts), drafts ready by the drafting
// run (lib/notify.ts). The notifications table's dedupe key keeps each one from going twice.

const turnOff = () => footnote(["You get this because notifications are on. Change them in ", { href: `${appUrl()}/app/settings/notifications`, label: "Settings" }, "."]);

export type LinkedInExpiringData = { firstName?: string | null; daysLeft: number; scheduledCount: number };

/** 7 days and 1 day before the LinkedIn connection ends. */
export function linkedinExpiring(data: LinkedInExpiringData): EmailContent {
  const url = `${appUrl()}/app/settings/channels`;
  const when = data.daysLeft <= 1 ? "tomorrow" : `in ${data.daysLeft} days`;
  return {
    subject: data.daysLeft <= 1 ? "Your LinkedIn connection ends tomorrow" : `Your LinkedIn connection ends in ${data.daysLeft} days`,
    preheader: "Reconnect so approved posts keep going out on schedule.",
    body: [
      heading(`LinkedIn disconnects ${when}`),
      paragraph([
        data.firstName ? `Hi ${data.firstName}, ` : "",
        "LinkedIn gives apps access for 60 days at a time. ",
        data.scheduledCount > 0
          ? { strong: `${data.scheduledCount} approved ${data.scheduledCount === 1 ? "post is" : "posts are"} waiting to go out.` }
          : "Reconnecting keeps your calendar ready to publish.",
      ]),
      actionPanel({ title: "Reconnect LinkedIn", note: "Takes a few seconds", label: "Reconnect", href: url }),
      paragraph("Until you reconnect, approved posts stay approved but won't publish."),
    ],
    footer: [linkFallback(url), turnOff()],
  };
}

export type EmptyNextWeekData = { firstName?: string | null; weekLabel: string; openSlots: number };

/** Next week has open posting slots and no drafts. */
export function emptyNextWeek(data: EmptyNextWeekData): EmailContent {
  const url = `${appUrl()}/app/calendar`;
  return {
    subject: `Nothing planned for ${data.weekLabel}`,
    preheader: `${data.openSlots} open ${data.openSlots === 1 ? "slot" : "slots"} next week. Fill them in a couple of minutes.`,
    body: [
      heading("Next week is empty"),
      paragraph([
        data.firstName ? `Hi ${data.firstName}, ` : "",
        "your calendar has ",
        { strong: `${data.openSlots} open ${data.openSlots === 1 ? "slot" : "slots"}` },
        ` for ${data.weekLabel} and no drafts yet. Poxeet can draft them in your voice for you to review.`,
      ]),
      actionPanel({ title: "Plan next week", note: "Drafts arrive in about a minute", label: "Open calendar", href: url }),
    ],
    footer: [linkFallback(url), turnOff()],
  };
}

export type PostFailedData = { firstName?: string | null; opening: string; reason: string; url: string };

/** A post couldn't be published and won't be retried on its own. */
export function postFailed(data: PostFailedData): EmailContent {
  return {
    subject: "A post didn't go out on LinkedIn",
    preheader: "Fix it and approve it again, or post it by hand.",
    body: [
      heading("A post didn't go out"),
      paragraph([data.firstName ? `Hi ${data.firstName}, ` : "", "this approved post wasn't published: ", { strong: `“${data.opening}”` }]),
      paragraph(data.reason),
      actionPanel({ title: "Fix and retry", note: "Edit it, then approve it again", label: "Open the post", href: data.url }),
      paragraph("You can also copy it, post it on LinkedIn yourself, and mark it as posted by hand."),
    ],
    footer: [linkFallback(data.url), turnOff()],
  };
}

export type DraftsReadyData = { firstName?: string | null; count: number; weekLabel: string; moreWeeks: number };

/** A week of drafts was written and saved (at most one a week; the member opts in). */
export function draftsReady(data: DraftsReadyData): EmailContent {
  const url = `${appUrl()}/app/drafts`;
  const drafts = `${data.count} new ${data.count === 1 ? "draft" : "drafts"}`;
  return {
    subject: `${drafts} for ${data.weekLabel}`,
    preheader: "Written in your voice. Review them, then approve the ones you like.",
    body: [
      heading("Your drafts are ready"),
      paragraph([
        data.firstName ? `Hi ${data.firstName}, ` : "",
        { strong: drafts },
        ` for ${data.weekLabel} ${data.count === 1 ? "is" : "are"} waiting in Drafts. Nothing goes out until you approve it.`,
      ]),
      actionPanel({ title: "Review your drafts", note: "Edit, regenerate or approve each one", label: "Open drafts", href: url }),
      ...(data.moreWeeks > 0 ? [paragraph(`The next ${data.moreWeeks === 1 ? "week is" : `${data.moreWeeks} weeks are`} being drafted now and will appear there too.`)] : []),
    ],
    footer: [linkFallback(url), turnOff()],
  };
}

export type WeeklySummaryData = {
  firstName?: string | null;
  weekLabel: string;
  /** Last week. */
  posted: number;
  notPosted: number;
  openings: string[];
  /** This week. */
  approved: number;
  drafts: number;
};

const posts = (count: number) => `${count} ${count === 1 ? "post" : "posts"}`;

/** Monday's look back at last week and ahead at this one (the member opts in). */
export function weeklySummary(data: WeeklySummaryData): EmailContent {
  const url = `${appUrl()}/app`;
  const next = data.drafts > 0
    ? { title: "Review your drafts", note: `${data.drafts} waiting for you`, label: "Open drafts", href: `${appUrl()}/app/drafts` }
    : { title: "See your week", note: "Your calendar and what's coming up", label: "Open Poxeet", href: url };
  return {
    subject: data.posted > 0 ? `Your week: ${posts(data.posted)} went out` : `Your week ahead: ${posts(data.approved)} lined up`,
    preheader: `${posts(data.approved)} approved for ${data.weekLabel}${data.drafts ? `, ${data.drafts} ${data.drafts === 1 ? "draft" : "drafts"} to review` : ""}.`,
    body: [
      heading("Your week on LinkedIn"),
      paragraph([
        data.firstName ? `Hi ${data.firstName}, ` : "",
        "last week ",
        data.posted > 0 ? { strong: `${posts(data.posted)} went out` } : "nothing went out",
        data.notPosted > 0 ? ` and ${posts(data.notPosted)} didn't` : "",
        data.openings.length ? ":" : ".",
      ]),
      ...data.openings.map((opening) => paragraph({ strong: `“${opening}”` })),
      paragraph([
        `For ${data.weekLabel}, `,
        data.approved > 0 ? { strong: `${posts(data.approved)} ${data.approved === 1 ? "is" : "are"} approved` } : "nothing is approved yet",
        data.drafts > 0 ? ` and ${data.drafts} ${data.drafts === 1 ? "draft is" : "drafts are"} waiting for review.` : ".",
      ]),
      actionPanel(next),
    ],
    footer: [linkFallback(next.href), turnOff()],
  };
}
