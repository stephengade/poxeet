/** Six colour tones (workroom.css, --wr-tone-*), one per content pillar, so a week reads at a glance. */
export const TONES = 6;

/** Pillars in a stable order (alphabetical), each with its own tone. Shared by the board, the day panel and Home. */
export function pillarTones(posts: { pillar?: string | null }[]) {
  const pillars = [...new Set(posts.map((post) => post.pillar).filter((pillar): pillar is string => Boolean(pillar)))].sort();
  return { pillars, toneOf: (pillar?: string | null) => (pillar ? pillars.indexOf(pillar) % TONES : undefined) };
}

/** The tone for a pillar in an ordered theme list from loadThemes (lib/themes.ts). */
export function toneIn(themes: string[], pillar?: string | null) {
  const index = pillar ? themes.indexOf(pillar) : -1;
  return index >= 0 ? index % TONES : undefined;
}
