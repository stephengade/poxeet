// Calendar math on plain "YYYY-MM-DD" dates, in UTC so the viewer's own timezone never shifts a day.
// Callers convert scheduled_at to the member's timezone before building these strings.

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const parseIsoDate = (value: string) => new Date(`${value}T00:00:00Z`);
/** 0 for Monday … 6 for Sunday. */
export const mondayIndex = (date: Date) => (date.getUTCDay() + 6) % 7;

export function addDays(value: string, days: number) {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function shiftMonth(month: string, by: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return isoDate(new Date(Date.UTC(year, monthNumber - 1 + by, 1))).slice(0, 7);
}

/** Every day shown for a month: whole weeks from the Monday on or before the 1st. */
export function monthGrid(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const lead = mondayIndex(first);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, 1 - lead + index));
    return { date: isoDate(date), day: date.getUTCDate(), weekday: index % 7, inMonth: date.getUTCMonth() === monthNumber - 1, monthName: MONTHS[date.getUTCMonth()] };
  });
}
