"use client";

import { useState } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "../ui/icon";

type Author = { name: string; headline?: string; initials: string; avatar?: string };
type Props = { text: string; author: Author; when?: string; clamp?: boolean; className?: string };

const ACTIONS: Array<[IconName, string]> = [["like", "Like"], ["comment", "Comment"], ["repost", "Repost"], ["send", "Send"]];

/** The post as it will look on LinkedIn. Text is plain text with its line breaks, never HTML. */
export function PostPreview({ text, author, when = "Now", clamp = true, className }: Props) {
  const [clamped, setClamped] = useState(clamp);
  const long = text.split("\n").length > 3 || text.length > 220;
  return (
    <article className={cn("pxt-post", className)} aria-label="Preview of the post as it will appear on LinkedIn">
      <div className="pxt-post-head">
        {author.avatar
          // eslint-disable-next-line @next/next/no-img-element -- a small local SVG; next/image adds nothing here
          ? <img className="pxt-avatar" src={author.avatar} alt="" width={48} height={48} />
          : <div className="pxt-avatar" aria-hidden="true">{author.initials}</div>}
        <div style={{ minWidth: 0 }}>
          <p className="pxt-post-name">{author.name}</p>
          {author.headline && <p className="pxt-post-meta">{author.headline}</p>}
          <p className="pxt-post-meta">{when} · <Icon name="globe" size={12} label="Public" /></p>
        </div>
      </div>
      <p className="pxt-post-text" data-clamped={clamped && long ? "true" : undefined}>{text}</p>
      {clamped && long && <button type="button" className="pxt-post-more" onClick={() => setClamped(false)}>…see more</button>}
      <div className="pxt-post-foot" aria-hidden="true">
        {ACTIONS.map(([icon, label]) => <span key={icon} className="pxt-post-act"><Icon name={icon} size={16} />{label}</span>)}
      </div>
    </article>
  );
}
