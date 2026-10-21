import type { ReactNode } from "react";
import { Skeleton } from "../ui";

// Placeholders shown by each workroom route's loading.tsx while its data streams in. Each one has the
// shape of its page, so the layout doesn't jump when the content arrives.

function Head({ sub = true }: { sub?: boolean }) {
  return (
    <div className="wr-head">
      <div className="wr-stack"><Skeleton width={240} height={28} />{sub && <Skeleton width={380} height={16} />}</div>
    </div>
  );
}

function Busy({ className, children }: { className: string; children: ReactNode }) {
  return <div className={className} aria-busy="true" aria-label="Loading">{children}</div>;
}

/** Steps list on the left, cards on the right: Home and Setup. */
export function SplitSkeleton() {
  return (
    <Busy className="wr-page">
      <Head />
      <div className="wr-split">
        <div className="wr-card wr-stack wr-split-side">
          {[0, 1, 2].map((row) => (
            <div key={row} className="wr-inline" style={{ alignItems: "flex-start" }}>
              <Skeleton width={24} height={24} radius="full" />
              <div className="wr-stack" style={{ flex: 1, gap: 6 }}><Skeleton width="60%" height={14} /><Skeleton width="90%" height={12} /></div>
            </div>
          ))}
        </div>
        <div className="wr-split-main wr-stack">
          <Skeleton height={180} radius="lg" />
          <Skeleton height={76} radius="lg" />
        </div>
      </div>
    </Busy>
  );
}

/** One wide card: Import. */
export function CardSkeleton() {
  return (
    <Busy className="wr-page">
      <Head />
      <div className="wr-card wr-stack">
        <div className="wr-stack" style={{ gap: 6 }}><Skeleton width={220} height={18} /><Skeleton width={320} height={12} /></div>
        <Skeleton height={220} radius="lg" />
      </div>
    </Busy>
  );
}

/** A settings page: heading and a form card. The settings nav stays on screen. */
export function SettingsSkeleton() {
  return (
    <Busy className="wr-stack">
      <div className="wr-stack" style={{ gap: 8 }}><Skeleton width={200} height={24} /><Skeleton width={340} height={14} /></div>
      <div className="wr-card wr-settings-card wr-stack">
        <div className="wr-form-grid">
          {[0, 1, 2, 3].map((field) => <div key={field} className="wr-stack" style={{ gap: 8 }}><Skeleton width={90} height={12} /><Skeleton height={44} radius="md" /></div>)}
        </div>
      </div>
    </Busy>
  );
}

/** An empty section's page: heading and the empty-state box. */
export function EmptySkeleton() {
  return (
    <Busy className="wr-page">
      <Head />
      <Skeleton height={240} radius="lg" />
    </Busy>
  );
}
