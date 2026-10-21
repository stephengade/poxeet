import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Props = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** raised floats with shadow-lg; muted is a quiet well inside another card. */
  variant?: "default" | "raised" | "muted";
  as?: ElementType;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
};

export function Card({ title, description, actions, variant = "default", as: Tag = "section", style, className, children }: Props) {
  return (
    <Tag className={cn("pxt-card", variant === "raised" && "pxt-card-raised", variant === "muted" && "pxt-card-muted", className)} style={style}>
      {(title || actions) && (
        <div className="pxt-card-head">
          <div>
            {title && <h3 className="pxt-card-title">{title}</h3>}
            {description && <p className="pxt-card-desc">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Tag>
  );
}
