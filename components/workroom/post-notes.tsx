import type { ReactNode } from "react";
import { Icon } from "../ui";

/** A post's pillar (in its colour), its type, and anything else short, as pills. */
export function PostTags({ pillar, postType, tone, children }: { pillar: string | null; postType: string | null; tone?: number; children?: ReactNode }) {
  return (
    <div className="wr-post-tags">
      {pillar && <span className="wr-pillar-pill" data-tone={tone}><span aria-hidden="true" />{pillar}</span>}
      {postType && <span className="wr-type-pill">{postType}</span>}
      {children}
    </div>
  );
}

/** What the drafter flagged for checking before the post goes out. */
export function PostFlags({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <div className="wr-flags">
      <span className="wr-flags-title"><Icon name="alert" size={14} />Check before posting</span>
      <ul>{flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
    </div>
  );
}

/** The plan behind a post: its angle and why it was chosen. */
export function PostWhy({ angle, rationale }: { angle?: string | null; rationale: string | null }) {
  if (!angle && !rationale) return null;
  return (
    <div className="wr-post-why">
      {angle && <p><span className="wr-post-why-label">Angle</span>{angle}</p>}
      {rationale && <p><span className="wr-post-why-label">Why this post</span>{rationale}</p>}
    </div>
  );
}
