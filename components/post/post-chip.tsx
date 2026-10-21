import { cn } from "../../lib/cn";
import { POST_STATUS, type PostStatus } from "../../lib/post-status";
import { Icon } from "../ui/icon";

type Props = {
  /** "09:00", in the member's timezone. */
  time: string;
  text: string;
  status?: PostStatus;
  onClick?: () => void;
  /** false when the chip sits inside a clickable calendar day. */
  interactive?: boolean;
  className?: string;
};

export function openingWords(text: string, count = 6) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, count).join(" ") + (words.length > count ? "…" : "");
}

/** One post inside a calendar day: time, opening words and status icon. */
export function PostChip({ time, text, status = "draft", onClick, interactive = true, className }: Props) {
  const look = POST_STATUS[status];
  const classes = cn("pxt-chip", `pxt-chip-${status}`, className);
  const inner = (
    <>
      <span className="pxt-chip-time">{time}</span>
      <span className="pxt-chip-text">{openingWords(text)}</span>
      <Icon name={look.icon} size={12} />
      <span className="pxt-sr">, {look.label}</span>
    </>
  );
  if (!interactive) return <span className={classes}>{inner}</span>;
  return <button type="button" className={classes} onClick={onClick}>{inner}</button>;
}
