"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type Props = {
  title: ReactNode;
  open?: boolean;
  onClose?: () => void;
  /** Secondary first, then the primary or destructive action last. */
  actions?: ReactNode;
  /** Render in place instead of over the page (documentation, previews). */
  inline?: boolean;
  children?: ReactNode;
};

/** Blocking dialog for a decision that needs confirming. */
export function Modal({ title, open = true, onClose, actions, inline, children }: Props) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || inline) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [open, inline]);

  if (!open) return null;
  return (
    <div className={cn("pxt-scrim", !inline && "pxt-scrim-fixed")} onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div
        ref={dialog}
        className="pxt-modal"
        role="dialog"
        aria-modal={!inline}
        aria-labelledby={`${id}-title`}
        aria-describedby={children ? `${id}-body` : undefined}
        tabIndex={-1}
        onKeyDown={(event) => { if (event.key === "Escape") onClose?.(); }}
      >
        <h2 className="pxt-modal-title" id={`${id}-title`}>{title}</h2>
        {children && <div className="pxt-modal-body" id={`${id}-body`}>{children}</div>}
        {actions && <div className="pxt-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
