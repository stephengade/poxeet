import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { renderIcon, type IconName } from "./icon";

type Props = { icon?: IconName | ReactNode; actionLabel?: string; onAction?: () => void; className?: string; children: ReactNode };

/** A short past-tense confirmation (Saved, Copied, Approved 3 posts). Errors that need action are Banners. */
export function Toast({ icon, actionLabel, onAction, className, children }: Props) {
  return (
    <div className={cn("pxt-toast", className)} role="status" aria-live="polite">
      {renderIcon(icon)}
      <span>{children}</span>
      {actionLabel && <button type="button" className="pxt-toast-action" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}
