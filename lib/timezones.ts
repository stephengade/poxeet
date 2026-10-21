// Time zones for pickers, from the browser's own list. Client side: Intl.supportedValuesOf runs in the browser.

export function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

/** Every zone the browser knows, with `current` and UTC always present. Labels read "America/New York". */
export function timezoneOptions(current: string) {
  let zones: string[] = [];
  try { zones = Intl.supportedValuesOf("timeZone"); } catch { /* old browsers: the current zone and UTC only */ }
  return Array.from(new Set([current, "UTC", ...zones])).map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));
}

/** 06:00 to 20:30 in half hours, for posting times. */
export const POSTING_TIMES = Array.from({ length: 30 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
