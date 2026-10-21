import { cn } from "../../lib/cn";

type Props = {
  width?: number | string;
  height?: number | string;
  radius?: "xs" | "sm" | "md" | "lg" | "xl" | "full";
  /** Render a paragraph of this many lines instead of one block. */
  lines?: number;
  className?: string;
};

export function Skeleton({ width = "100%", height = 16, radius, lines, className }: Props) {
  if (lines) {
    return (
      <div className={cn("pxt-skel-lines", className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className="pxt-skel" style={{ height: 12, width: index === lines - 1 ? "62%" : "100%" }} />
        ))}
      </div>
    );
  }
  return <span className={cn("pxt-skel", className)} aria-hidden="true" style={{ width, height, borderRadius: radius ? `var(--radius-${radius})` : undefined }} />;
}
