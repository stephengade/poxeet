import type { Slot } from "../member";

// Posting slots for a plan, from the member's weekly rhythm (Settings → Publishing schedule) in their timezone.
// Pure, so it's tested directly. Dates are "YYYY-MM-DD" and times "HH:MM" in the member's timezone; scheduled_at
// is the UTC instant for that local time.

const DAY_INDEX: Record<Slot["day"], number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

/** Milliseconds the timezone is ahead of UTC at that instant (for example +3600000 for UTC+1). */
function offsetMs(at: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at).map((part) => [part.type, part.value]));
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant of a local date and time in a timezone, correct across daylight-saving changes. */
export function zonedToUtc(date: string, time: string, timeZone: string) {
  const asUtc = new Date(`${date}T${time}:00Z`);
  let instant = new Date(asUtc.getTime() - offsetMs(asUtc, timeZone));
  const corrected = offsetMs(instant, timeZone);
  instant = new Date(asUtc.getTime() - corrected);
  return instant;
}

/** "YYYY-MM-DD" and "HH:MM" for an instant, in a timezone. */
export function localParts(at: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** The Monday on or before a date. */
export const mondayOf = (date: string) => addDays(date, -weekdayIndex(date));

export type PlanSlot = { index: number; week: number; date: string; time: string; weekday: string; scheduledAt: string };

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Every slot from `startDate` for `weeks` weeks (week 1 starts on startDate), in date order, skipping times
 * already past. `week` is 0-based and counts from startDate in steps of 7 days, so drafting goes a week at a time.
 */
export function planSlots({ startDate, weeks, slots, timeZone, now = new Date() }: {
  startDate: string; weeks: number; slots: Slot[]; timeZone: string; now?: Date;
}): PlanSlot[] {
  const result: Omit<PlanSlot, "index">[] = [];
  for (let offset = 0; offset < weeks * 7; offset++) {
    const date = addDays(startDate, offset);
    const weekday = weekdayIndex(date);
    for (const slot of slots.filter((item) => DAY_INDEX[item.day] === weekday).sort((a, b) => a.time.localeCompare(b.time))) {
      const at = zonedToUtc(date, slot.time, timeZone);
      if (at <= now) continue;
      result.push({ week: Math.floor(offset / 7), date, time: slot.time, weekday: WEEKDAY_NAMES[weekday], scheduledAt: at.toISOString() });
    }
  }
  return result.map((slot, index) => ({ ...slot, index }));
}
