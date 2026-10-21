"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { LinkedInLogo } from "../../../../../components/brand/channel-logos";
import { Button } from "../../../../../components/ui";
import { disconnectLinkedIn } from "./actions";

type Account = { name: string | null; expiresAt: string; expired: boolean } | null;

const RESULT: Record<string, { tone: "success" | "error" | "info"; title: string; description?: string; next?: { label: string; href: string } }> = {
  connected: { tone: "success", title: "LinkedIn is connected.", description: "AI access is unlocked. That's the next step.", next: { label: "Add AI access", href: "/app/settings/ai" } },
  cancelled: { tone: "info", title: "LinkedIn wasn't connected.", description: "You cancelled on LinkedIn. Connect whenever you're ready." },
  denied: { tone: "error", title: "LinkedIn didn't allow the connection.", description: "Try again, and approve every permission Poxeet asks for." },
  no_posting: { tone: "error", title: "Posting permission is missing.", description: "LinkedIn didn't grant permission to post. Ask the app owner to enable Share on LinkedIn." },
  expired: { tone: "error", title: "That sign-in expired.", description: "Start again from this page. It only works in the browser you started from." },
  not_configured: { tone: "error", title: "LinkedIn isn't set up yet.", description: "Ask the app owner to add the LinkedIn app's keys." },
  error: { tone: "error", title: "We couldn't finish connecting LinkedIn.", description: "Try again in a minute." },
};

/** Shows the result of a round trip to LinkedIn once, then tidies the URL. */
function ResultToast() {
  const params = useSearchParams();
  const router = useRouter();
  const shown = useRef(false);
  useEffect(() => {
    const result = params.get("linkedin");
    if (!result || shown.current) return;
    shown.current = true;
    const look = RESULT[result] ?? RESULT.error;
    toast[look.tone](look.title, {
      description: look.description,
      ...(look.next ? { action: { label: look.next.label, onClick: () => router.push(look.next!.href) }, duration: 10_000 } : {}),
    });
    router.replace("/app/settings/channels", { scroll: false });
  }, [params, router]);
  return null;
}

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

type Props = { account: Account; connected: boolean; paused: boolean; lastPost: string | null };

export function LinkedInCard({ account, connected, paused, lastPost }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const days = account ? daysLeft(account.expiresAt) : 0;

  function disconnect() {
    if (!confirm) return setConfirm(true);
    start(async () => {
      const result = await disconnectLinkedIn();
      setConfirm(false);
      if (!result.ok) return void toast.error(result.message);
      toast.success("LinkedIn disconnected.", { description: "Nothing will be posted until you connect again." });
    });
  }

  const state = !account ? "off" : account.expired ? "expired" : days <= 7 ? "expiring" : "on";
  const label = { off: "Not connected", expired: "Access ended", expiring: "Reconnect soon", on: "Connected" }[state];
  const line = !account
    ? "Poxeet posts the drafts you approve to your personal profile, and nothing else."
    : account.expired
      ? "Reconnect so approved posts can go out."
      : `Posting as ${account.name ?? "you"} · personal profile`;

  return (
    <section className="wr-card wr-settings-card wr-channel-card">
      <ResultToast />
      <div className="wr-settings-card-head wr-settings-card-row">
        <div className="wr-channel-id">
          <LinkedInLogo size={44} />
          <div>
            <h3 className="wr-h2">LinkedIn<span className="wr-channel-status" data-state={state}>{label}</span></h3>
            <p className="wr-sub wr-small">{line}</p>
          </div>
        </div>
        <form action="/api/linkedin/connect" method="post">
          <Button type="submit" variant={connected && days > 7 ? "secondary" : "primary"} size="sm" icon={account ? "refresh" : undefined}>{account ? "Reconnect" : "Connect LinkedIn"}</Button>
        </form>
      </div>
      {account && !account.expired && (
        <div className="wr-channel-facts">
          <div><span>Access ends</span><strong>In {days} {days === 1 ? "day" : "days"} · {DATE.format(new Date(account.expiresAt))}</strong></div>
          <div><span>Auto-posting</span><strong>{paused ? "Paused" : "On"}</strong></div>
          <div><span>Last post sent</span><strong>{lastPost ?? "None yet"}</strong></div>
        </div>
      )}
      <div className="wr-channel-foot">
        {account ? (
          <p>
            You get an email 7 days before access ends. Posts always go through LinkedIn&apos;s official API.{" "}
            <button type="button" className="wr-text-btn" data-danger={confirm || undefined} disabled={pending} onClick={disconnect} onBlur={() => setConfirm(false)}>
              {confirm ? "Click again to disconnect" : "Disconnect LinkedIn"}
            </button>
          </p>
        ) : (
          <p>You&apos;ll approve on LinkedIn and come straight back. Poxeet never reads your feed or messages, and LinkedIn asks you to reconnect about every 60 days.</p>
        )}
      </div>
    </section>
  );
}
