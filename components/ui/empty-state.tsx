import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./icon";

type Props = { title: ReactNode; icon?: IconName; action?: ReactNode; className?: string; children?: ReactNode };

/** What a list shows before it has content: what will appear, and the one action that fills it. */
export function EmptyState({ title, icon = "calendar", action, className, children }: Props) {
  return (
    <div className={cn("pxt-empty", className)}>
      <div className="pxt-empty-mark"><Icon name={icon} size={22} /></div>
      <p className="pxt-empty-title">{title}</p>
      {children && <p className="pxt-empty-text">{children}</p>}
      {action}
    </div>
  );
}
