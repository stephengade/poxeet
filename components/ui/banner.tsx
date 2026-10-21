import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./icon";

const TONE_ICON = { info: "info", warning: "clock", critical: "alert", success: "check-double" } as const satisfies Record<string, IconName>;

type Props = {
  tone?: keyof typeof TONE_ICON;
  /** What happened. */
  title?: ReactNode;
  /** What to do next. */
  children?: ReactNode;
  icon?: IconName;
  /** One small Button. */
  action?: ReactNode;
  className?: string;
};

/** A message about the account that stays until the problem is fixed. */
export function Banner({ tone = "info", title, children, icon, action, className }: Props) {
  return (
    <div className={cn("pxt-banner", `pxt-banner-${tone}`, className)} role={tone === "critical" ? "alert" : "status"}>
      <Icon name={icon ?? TONE_ICON[tone]} size={18} />
      <div className="pxt-banner-body">
        {title && <p className="pxt-banner-title">{title}</p>}
        {children && <p className="pxt-banner-text">{children}</p>}
      </div>
      {action && <div className="pxt-banner-action">{action}</div>}
    </div>
  );
}
