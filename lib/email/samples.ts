import type { TemplateData, TemplateName } from "./index";

// Sample data for every template: used by /dev/emails and `pnpm email:test`. Fictional people only.

const inThreeMonths = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

export const SAMPLES: { [N in TemplateName]: TemplateData<N> } = {
  invite: { firstName: "Stephen", accessType: "all", accessCode: "CODE01", codeExpiresAt: inThreeMonths, email: "stephen@example.com" },
  linkedinConnected: { firstName: "Stephen", linkedinName: "Stephen Ken", expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), reconnected: false },
  linkedinDisconnected: { firstName: "Stephen", linkedinName: "Stephen Ken" },
  linkedinExpiring: { firstName: "Stephen", daysLeft: 7, scheduledCount: 4 },
  emptyNextWeek: { firstName: "Stephen", weekLabel: "the week of 26 October", openSlots: 3 },
  creditsReceipt: {
    firstName: "Stephen", credits: 1050, amount: 10, currency: "USD", paidAt: new Date(), receiptId: "ch_sample123",
    balance: 1092, weeksLeft: 13, expiresAt: inThreeMonths,
  },
  postFailed: {
    firstName: "Stephen", opening: "Most roadmaps are wishlists.", url: "https://poxeet.example/app/posts/sample",
    reason: "LinkedIn didn't accept this post: the text is too long. Edit it, then approve it again.",
  },
  creditsLow: { firstName: "Stephen", balance: 6, buyUrl: "https://poxeet.example/app/settings/credits", from: "₦3,000" },
  draftsReady: { firstName: "Stephen", count: 3, weekLabel: "the week of 26 October", moreWeeks: 3 },
  weeklySummary: {
    firstName: "Stephen", weekLabel: "the week of 26 October", posted: 2, notPosted: 1, approved: 3, drafts: 1,
    openings: ["Most roadmaps are wishlists.", "We hired slower last year and shipped faster."],
  },
};
