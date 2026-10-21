import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./icon";

type Props = { tone?: "brand" | "quiet"; arrow?: boolean; href?: string; className?: string; children: ReactNode };

/** Small uppercase pill above a display headline. */
export function Eyebrow({ tone = "brand", arrow, href, className, children }: Props) {
  const classes = cn("pxt-eyebrow", tone === "quiet" && "pxt-eyebrow-quiet", className);
  const inner = <><span>{children}</span>{arrow && <Icon name="arrow-right" size={14} />}</>;
  return href ? <Link className={classes} href={href}>{inner}</Link> : <span className={classes}>{inner}</span>;
}
