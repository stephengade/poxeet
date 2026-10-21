import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { POST_STATUS, type PostStatus } from "../../lib/post-status";
import { Icon, renderIcon, type IconName } from "./icon";

const TONE_CLASS = { neutral: "neutral", brand: "approved", success: "posted", warning: "warning", danger: "failed" } as const;

type Props = {
  /** A post status: the label and icon follow the status table. */
  status?: PostStatus;
  /** For labels that are not post states. */
  tone?: keyof typeof TONE_CLASS;
  icon?: IconName | ReactNode;
  title?: string;
  className?: string;
  children?: ReactNode;
};

/** Icon plus word, so status is never shown by color alone. */
export function Badge({ status, tone = "neutral", icon, title, className, children }: Props) {
  if (status) {
    const look = POST_STATUS[status];
    return (
      <span className={cn("pxt-badge", `pxt-badge-${look.tone}`, className)} title={title}>
        <Icon name={look.icon} size={14} />
        <span>{children ?? look.label}</span>
      </span>
    );
  }
  return (
    <span className={cn("pxt-badge", `pxt-badge-${TONE_CLASS[tone]}`, className)} title={title}>
      {renderIcon(icon, 14)}
      <span>{children}</span>
    </span>
  );
}
