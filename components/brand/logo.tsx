import type { CSSProperties } from "react";
import { APP_NAME } from "../../lib/config";
import { cn } from "../../lib/cn";

type Props = {
  variant?: "lockup" | "wordmark" | "mark";
  tone?: "default" | "brand" | "inverse";
  /** The mark's height in px. The wordmark, gap and corner radius scale from it. */
  size?: number;
  label?: string;
  className?: string;
};

// No drawn artwork: the mark is "Px" in a rounded square and the wordmark is the lowercase name,
// both set in Geist Medium (the sans token). Static exports (favicon, social images) use the outlined SVGs in public/brand.
export function Logo({ variant = "lockup", tone = "default", size = 28, label = APP_NAME, className }: Props) {
  return (
    <span
      className={cn("pxt-logo", tone === "brand" && "pxt-logo-brand", tone === "inverse" && "pxt-logo-inverse", className)}
      style={{ "--logo": `${size}px` } as CSSProperties}
      role="img"
      aria-label={label}
    >
      {variant !== "wordmark" && <span className="pxt-logo-mark" aria-hidden="true"><span>Px</span></span>}
      {variant !== "mark" && <span className="pxt-logo-word" aria-hidden="true">{APP_NAME.toLowerCase()}</span>}
    </span>
  );
}
