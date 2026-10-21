import type { CalendarPost } from "../calendar/calendar-month";

// Sample content for the landing page and the style guide. The author is fictional;
// never show a real member's posts in demos or screenshots.
// The avatar is a DiceBear "Notionists" illustration (CC0), stored locally in public/brand/sample.
export const SAMPLE_AUTHOR = { name: "Stephen Ken", headline: "Product lead · Sample profile", initials: "SK", avatar: "/brand/sample/stephen-ken.svg" };
export const SAMPLE_MONTH = "2026-10";
export const SAMPLE_TODAY = "2026-10-14";

export const SAMPLE_POSTS: CalendarPost[] = [
  { id: 1, date: "2026-10-02", time: "09:00", status: "posted", text: "The best feedback I got this year came from a support ticket.\n\nNot a survey. Not an interview. A two-line ticket that said: \"I don't know what this button will do.\"\n\nWe changed one word. Support tickets about it went to zero.\n\nWhere is your best feedback hiding?" },
  { id: 2, date: "2026-10-05", time: "09:00", status: "posted", text: "Three things I'd tell my first-year self about scope.\n\n1. Cutting is a skill, not a failure.\n2. The first version is for learning, not for launching.\n3. If everything is a priority, the calendar decides for you.\n\nWhich one took you longest to learn?" },
  { id: 3, date: "2026-10-07", time: "09:00", status: "posted", text: "We shipped the boring version first.\n\nNo animations. No onboarding tour. A form and a button.\n\nIt told us more in a week than the polished prototype told us in a month." },
  { id: 4, date: "2026-10-09", time: "09:00", status: "posted", text: "Hiring is a product problem.\n\nYour job post is a landing page. Your interview is onboarding. Your offer is the checkout.\n\nMost teams would never ship a funnel this leaky." },
  { id: 5, date: "2026-10-12", time: "09:00", status: "needs_check", text: "The meeting that should have been a doc.\n\nI ran an experiment: for two weeks, every status meeting became a one-page written update.\n\nWe got back four hours a week, and the decisions got better." },
  { id: 6, date: "2026-10-14", time: "09:00", status: "approved", text: "Most people never post because the blank box wins.\n\nI used to open LinkedIn, type a sentence, delete it and close the tab. What changed was small: I stopped writing posts and started writing notes to one person.\n\nOne reader. One honest sentence. Then the next.\n\nWhat's the note you keep almost sending?" },
  { id: 7, date: "2026-10-14", time: "12:30", status: "draft", text: "Quick question for founders: what's on your pricing page that you would remove if nobody was watching?" },
  { id: 8, date: "2026-10-14", time: "17:00", status: "draft", text: "What I learned from 40 user calls in one quarter, in five lines." },
  { id: 9, date: "2026-10-16", time: "09:00", status: "approved", text: "Your roadmap is a list of bets. Price them.\n\nEvery item should say what you expect to learn and what it costs to find out. If you can't price it, you can't prioritize it." },
  { id: 10, date: "2026-10-19", time: "09:00", status: "approved", text: "What I stopped doing in one-to-ones: status updates.\n\nThat's what the written update is for. The hour is for the person." },
  { id: 11, date: "2026-10-21", time: "09:00", status: "draft", text: "A small story about a big launch, and the one email that saved it." },
  { id: 12, date: "2026-10-23", time: "09:00", status: "skipped", text: "Hot take on OKRs for teams under ten people." },
  { id: 13, date: "2026-10-26", time: "09:00", status: "draft", text: "The checklist I use before any launch, and the item I always forget." },
  { id: 14, date: "2026-10-28", time: "09:00", status: "draft", text: "Why I write the press release before the first line of code." },
  { id: 15, date: "2026-10-30", time: "09:00", status: "draft", text: "October in three lessons." },
];
