import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

// Poxeet's outline set: 24px grid, 1.75 stroke, round caps and joins, drawn in currentColor.
const circle = <circle cx="12" cy="12" r="9" />;
const paths = (...d: string[]) => d.map((value) => <path key={value} d={value} />);

const ICONS = {
  check: paths("M5 12.5l4.5 4.5L19 7.5"),
  "check-double": paths("M2.5 12.5l4.5 4.5 9.5-9.5", "M12 16.5l.5.5 9.5-9.5"),
  alert: [circle, ...paths("M12 7.5v5.5", "M12 16.5h.01")],
  info: [circle, ...paths("M12 11v5.5", "M12 7.5h.01")],
  clock: [circle, ...paths("M12 7v5l3 2")],
  pencil: paths("M4 20h4L19 9l-4-4L4 16v4z", "M13.5 6.5l4 4"),
  skip: [circle, ...paths("M6.5 17.5l11-11")],
  send: paths("M4 12l16-8-6 16-2.5-6.5L4 12z", "M11.5 13.5L20 4"),
  "arrow-right": paths("M5 12h14", "M13 6l6 6-6 6"),
  "chevron-left": paths("M15 6l-6 6 6 6"),
  "chevron-right": paths("M9 6l6 6-6 6"),
  globe: [circle, ...paths("M3 12h18", "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z")],
  calendar: [<rect key="r" x="3" y="5" width="18" height="16" rx="3" />, ...paths("M3 10h18", "M8 3v4", "M16 3v4")],
  list: paths("M9 6h11", "M9 12h11", "M9 18h11", "M4.5 6h.01", "M4.5 12h.01", "M4.5 18h.01"),
  x: paths("M6 6l12 12", "M18 6L6 18"),
  pause: paths("M9 6v12", "M15 6v12"),
  copy: [<rect key="r" x="8" y="8" width="12" height="12" rx="2" />, ...paths("M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2")],
  refresh: paths("M20 11a8 8 0 0 0-14.6-4.5L4 8", "M4 4v4h4", "M4 13a8 8 0 0 0 14.6 4.5L20 16", "M20 20v-4h-4"),
  plus: paths("M12 5v14", "M5 12h14"),
  link: paths("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"),
  upload: paths("M12 16V4", "M7 9l5-5 5 5", "M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"),
  voice: paths("M4 7c2.5 0 2.5 10 5 10s2.5-10 5-10 2.5 10 5 10", "M20 7h.01"),
  like: paths("M7 11v9H4v-9h3z", "M7 11l4-8c1.7 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"),
  comment: paths("M4 5h16v11H9l-5 4V5z"),
  repost: paths("M17 3l3 3-3 3", "M4 11V9a3 3 0 0 1 3-3h13", "M7 21l-3-3 3-3", "M20 13v2a3 3 0 0 1-3 3H4"),
  spinner: paths("M12 3a9 9 0 1 0 9 9"),
  home: paths("M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z"),
  doc: paths("M7 3h7l5 5v13H7V3z", "M14 3v5h5", "M10 13h6", "M10 17h4"),
  sliders: [<circle key="a" cx="15" cy="7" r="2" />, <circle key="b" cx="9" cy="17" r="2" />, ...paths("M4 7h9", "M17 7h3", "M4 17h3", "M11 17h9")],
  briefcase: [<rect key="r" x="3" y="7" width="18" height="13" rx="2" />, ...paths("M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M3 13h18")],
  mail: [<rect key="r" x="3" y="5" width="18" height="14" rx="2" />, ...paths("M3 7l9 6 9-6")],
  search: [<circle key="c" cx="11" cy="11" r="7" />, ...paths("M20 20l-3.5-3.5")],
  bell: paths("M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z", "M10 21h4"),
  sparkle: paths("M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z", "M19 16l.7 2 1.8.6-1.8.6-.7 1.8-.7-1.8-1.8-.6 1.8-.6.7-2z"),
  "chevron-down": paths("M6 9l6 6 6-6"),
  more: [<circle key="a" cx="5" cy="12" r="1" />, <circle key="b" cx="12" cy="12" r="1" />, <circle key="c" cx="19" cy="12" r="1" />],
  pulse: paths("M3 12h4l3-8 4 16 3-8h4"),
  logout: paths("M9 4H5v16h4", "M15 8l4 4-4 4", "M19 12H9"),
  lock: [<rect key="r" x="5" y="11" width="14" height="10" rx="2" />, ...paths("M8 11V8a4 4 0 0 1 8 0v3")],
  monitor: [<rect key="r" x="3" y="4" width="18" height="12" rx="2" />, ...paths("M8 20h8", "M12 16v4")],
  phone: [<rect key="r" x="7" y="2" width="10" height="20" rx="2" />, ...paths("M11 18h2")],
  card: [<rect key="r" x="3" y="5" width="18" height="14" rx="2" />, ...paths("M3 10h18", "M7 15h3")],
  shield: paths("M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"),
  menu: paths("M4 6h16", "M4 12h16", "M4 18h16"),
  sidebar: [<rect key="r" x="3" y="4" width="18" height="16" rx="2" />, ...paths("M9 4v16")],
} satisfies Record<string, ReactNode[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

type Props = { name: IconName; size?: number; strokeWidth?: number; label?: string; className?: string };

export function Icon({ name, size = 16, strokeWidth = 1.75, label, className }: Props) {
  return (
    <svg
      className={cn("pxt-icon", name === "spinner" && "pxt-spin", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {ICONS[name].map((shape, index) => <g key={index}>{shape}</g>)}
    </svg>
  );
}

export function renderIcon(icon: IconName | ReactNode, size = 16) {
  if (!icon) return null;
  return typeof icon === "string" ? <Icon name={icon as IconName} size={size} /> : icon;
}
