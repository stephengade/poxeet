"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { SkyBand } from "../../../../components/preview/parts";
import { Banner, Button, Icon, Skeleton, type IconName } from "../../../../components/ui";
import { JobProgress, type JobStep } from "../../../../components/workroom/job-progress";
import { VoiceOrb } from "../../../../components/workroom/voice-orb";
import { GOOD_VOICE_POSTS } from "../../../../lib/import/posts";
import type { VoiceProfile } from "../../../../lib/voice/profile";
import { startVoiceAnalysis, voiceStatus, type VoiceStatus } from "./actions";

export type VoiceVersion = { version: number; origin: string; active: boolean; posts: number; createdAt: string };

type Props = {
  postCount: number;
  status: VoiceStatus;
  profile: VoiceProfile | null;
  active: { version: number; posts: number; createdAt: string } | null;
  versions: VoiceVersion[];
  /** Post text by id, for the signature moves' examples. */
  examples: Record<string, string>;
};

const POLL_MS = 3_000;
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const plural = (count: number, word: string) => `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const SCALE: Record<"formality" | "humor" | "emotionality", string[]> = {
  formality: ["Very casual", "Casual", "Balanced", "Formal", "Very formal"],
  humor: ["None", "A little", "Some", "Often funny", "Very playful"],
  emotionality: ["Detached", "Reserved", "Balanced", "Expressive", "Very expressive"],
};
const PERSON: Record<VoiceProfile["language"]["person"], string> = {
  first_person_singular: "First person (I)", first_person_plural: "First person plural (we)", second_person: "Speaks to the reader (you)",
  third_person: "Third person", mixed: "Mixed",
};
const FREQUENCY = { never: "Never", rare: "Rarely", sometimes: "Sometimes", often: "Often" } as const;
const PLACEMENT = { none: "none", inline: "within the text", end: "at the end", mixed: "within and at the end" } as const;
const CONFIDENCE_BARS = { low: 1, medium: 2, high: 3 } as const;

type VoiceTab = "profile" | "moves" | "rules" | "versions";
const TABS: Array<{ id: VoiceTab; label: string; icon: IconName; tone: number }> = [
  { id: "profile", label: "Profile", icon: "voice", tone: 0 },
  { id: "moves", label: "Signature moves", icon: "sparkle", tone: 1 },
  { id: "rules", label: "Rules and topics", icon: "check", tone: 4 },
  { id: "versions", label: "Versions", icon: "clock", tone: 2 },
];

/** Keeps asking for the status while an analysis runs; refreshes the page when it ends. */
function useAnalysis(initial: VoiceStatus) {
  const router = useRouter();
  // Seeded from the server once; after that this component tracks the run itself (it polls while it runs).
  const [status, setStatus] = useState(initial);
  useEffect(() => {
    if (status.status !== "running") return;
    let stopped = false;
    const timer = setInterval(async () => {
      const next = await voiceStatus();
      if (stopped || next.status === "running") return;
      clearInterval(timer);
      setStatus(next);
      if (next.status === "done") toast.success("Your voice profile is ready.", { description: "Read it through and check it sounds like you." });
      else if (next.status === "failed") toast.error("The analysis didn't finish.", { description: next.message });
      router.refresh();
    }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [status, router]);
  return [status, setStatus] as const;
}

export function VoiceView({ postCount, status: initial, profile, active, versions, examples }: Props) {
  const [status, setStatus] = useAnalysis(initial);
  const [starting, start] = useTransition();
  const [tab, setTab] = useState<VoiceTab>("profile");
  const running = status.status === "running";

  function analyse() {
    start(async () => {
      const result = await startVoiceAnalysis();
      if (!result.ok) {
        setStatus({ status: "failed", reason: result.reason, message: result.message });
        return void toast.error(result.message);
      }
      setStatus({ status: "running", startedAt: new Date().toISOString() });
      if (!result.started) toast("An analysis is already running.");
    });
  }

  const failure = status.status === "failed" ? status : null;
  const failureBanner = failure && (
    <Banner tone="critical" title="The analysis didn't finish" action={<FailureAction reason={failure.reason} onRetry={analyse} busy={starting} />}>
      {failure.message}
    </Banner>
  );

  if (!profile) {
    return (
      <div className="wr-page">
        <div className="wr-head"><div><h1 className="wr-title">Voice</h1><p className="wr-sub">How Poxeet writes like you.</p></div></div>
        {failureBanner}
        {running ? <Analysing postCount={postCount} startedAt={status.status === "running" ? status.startedAt : null} /> : (
          <section className="wr-card wr-stack wr-voice-start">
            <VoiceOrb size={72} label="Ready" />
            <h2 className="wr-h2">Ready to learn your voice</h2>
            <p className="wr-sub">
              Poxeet reads your {plural(postCount, "post")} and describes how you write: tone, how you open and close, length, formatting and
              the habits that make a post yours. It takes about a minute.
            </p>
            <Button onClick={analyse} loading={starting} icon="sparkle">Analyse my voice</Button>
            {postCount < GOOD_VOICE_POSTS && (
              <span className="wr-small wr-muted">{postCount} posts is enough to start. <Link href="/app/import" className="wr-link">Add more</Link> (10 or more) for a sharper voice.</span>
            )}
          </section>
        )}
      </div>
    );
  }

  const bars = CONFIDENCE_BARS[profile.confidence];
  return (
    <div className="wr-page">
      <SkyBand className="wr-band">
        <div className="wr-band-text">
          <h1 className="wr-sky-kicker">Your voice{active ? ` · v${active.version}` : ""}</h1>
          <p className="wr-band-quote">&ldquo;{profile.summary}&rdquo;</p>
          <div className="wr-band-meta">
            <span className="wr-meter" role="img" aria-label={`Confidence ${profile.confidence}`}>
              {[1, 2, 3].map((bar) => <span key={bar} data-on={bar <= bars || undefined} />)}
            </span>
            <span>Confidence {profile.confidence}</span>
            {active && <span>Based on {plural(active.posts, "post")} · {DATE.format(new Date(active.createdAt))}</span>}
            {profile.confidence !== "high" && <Link href="/app/import" className="wr-band-link">Add more posts to raise it</Link>}
          </div>
        </div>
        <div className="wr-sky-actions">
          <button type="button" className="wr-btn-glass" onClick={analyse} disabled={running || starting}>
            <Icon name={running ? "spinner" : "refresh"} size={15} />{running ? "Analysing…" : "Analyse again"}
          </button>
        </div>
      </SkyBand>

      {failureBanner}
      {running && <Analysing postCount={postCount} startedAt={status.status === "running" ? status.startedAt : null} />}

      <div className="wr-voice-tabs" role="tablist" aria-label="Voice">
        {TABS.filter((item) => item.id !== "moves" || profile.signature_moves.length > 0).map((item) => {
          const count = item.id === "moves" ? profile.signature_moves.length : item.id === "rules" ? profile.rules.always.length + profile.rules.never.length : item.id === "versions" ? versions.length : null;
          return (
            <button key={item.id} type="button" role="tab" id={`voice-tab-${item.id}`} aria-controls="voice-panel" aria-selected={tab === item.id} data-tone={item.tone} onClick={() => setTab(item.id)}>
              <span className="wr-voice-tab-icon" aria-hidden="true"><Icon name={item.icon} size={15} /></span>
              {item.label}
              {count ? <span className="wr-voice-tab-count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div id="voice-panel" role="tabpanel" aria-labelledby={`voice-tab-${tab}`}>
        {tab === "profile" && (
          <section className="wr-card wr-traits" aria-label="Voice details">
            {running ? <div style={{ padding: 20 }}><Skeleton lines={10} /></div> : <Traits profile={profile} />}
          </section>
        )}
        {tab === "moves" && (
          <section className="wr-card" aria-labelledby="moves-h">
            <div className="wr-card-head"><div><h2 id="moves-h" className="wr-h2">Signature moves</h2><p className="wr-sub wr-small">Habits found across your posts. Drafts use them, never all at once.</p></div></div>
            <ol className="wr-moves">
              {profile.signature_moves.map((move, index) => {
                const example = move.example_post_ids.map((id) => examples[id]).find(Boolean);
                return (
                  <li key={move.name} data-tone={index % 6}>
                    <span className="wr-mono">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{move.name}</strong>
                      <span className="wr-small">{move.description}</span>
                      <span className="wr-small wr-muted">Seen in {plural(move.example_post_ids.length, "post")}{example ? `: “${excerpt(example)}”` : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        {tab === "rules" && (
          <div className="wr-two wr-voice-rules">
            <Rules profile={profile} />
            <section className="wr-card wr-stack" aria-labelledby="topics-h">
              <h2 id="topics-h" className="wr-h2">Topics</h2>
              <span className="wr-small wr-muted">Writes about</span>
              <Chips items={profile.topics.recurring} empty="Not clear from these posts yet." />
              {profile.topics.off_limits.length > 0 && (
                <>
                  <span className="wr-small wr-muted">Never writes about</span>
                  <Chips items={profile.topics.off_limits} tone="avoid" />
                </>
              )}
            </section>
          </div>
        )}
        {tab === "versions" && (
          <section className="wr-card" aria-labelledby="versions-h">
            <h2 id="versions-h" className="wr-h2" style={{ marginBottom: 14 }}>Versions</h2>
            {versions.length ? (
              <ol className="wr-timeline">
                {versions.map((item) => (
                  <li key={item.version} data-active={item.active || undefined}>
                    <span className="wr-timeline-dot" aria-hidden="true" />
                    <span>
                      <strong>v{item.version} · {DATE.format(new Date(item.createdAt))}{item.active ? " · active" : ""}</strong>
                      <span className="wr-small wr-muted">
                        {item.origin === "generated" ? `Analysed from ${plural(item.posts, "post")}` : item.origin === "user_edited" ? "Your edits" : "Restored"}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : <p className="wr-small wr-muted">No versions yet.</p>}
          </section>
        )}
      </div>
    </div>
  );
}

const excerpt = (text: string) => {
  const line = text.split("\n").find((part) => part.trim())?.trim() ?? text;
  return line.length > 110 ? `${line.slice(0, 107).trimEnd()}…` : line;
};

function FailureAction({ reason, onRetry, busy }: { reason: string | null; onRetry: () => void; busy: boolean }) {
  if (reason === "no_credits") return <Button size="sm" href="/app/settings/credits?buy=1">Buy credits</Button>;
  if (reason === "no_access" || reason === "not_configured" || reason === "cap_reached") return <Button size="sm" href="/app/settings/ai">AI access</Button>;
  if (reason === "no_posts") return <Button size="sm" href="/app/import">Add posts</Button>;
  return <Button size="sm" onClick={onRetry} loading={busy}>Try again</Button>;
}

/** The analysis stages, by time: the job doesn't report its stage, so these follow its usual pace. */
function analysisSteps(startedAt: string | null): JobStep[] {
  const seconds = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 1000 : 0;
  const stage = seconds < 4 ? 0 : seconds < 12 ? 1 : 2;
  return ["Read your posts", "Measure your style", "Write your voice profile"].map((label, index) => ({
    label, state: index < stage ? "done" : index === stage ? "active" : "todo",
  }));
}

function Analysing({ postCount, startedAt }: { postCount: number; startedAt: string | null }) {
  const [steps, setSteps] = useState(() => analysisSteps(startedAt));
  useEffect(() => {
    const timer = setInterval(() => setSteps(analysisSteps(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return (
    <JobProgress
      title="Learning your voice"
      detail={`Reading your ${plural(postCount, "post")}: how you open and close, sentence length, tone, formatting and the topics you return to. Usually under a minute.`}
      percent={null}
      steps={steps}
      startedAt={startedAt}
    />
  );
}

function Chips({ items, tone, empty }: { items: string[]; tone?: "avoid"; empty?: string }) {
  if (!items.length) return empty ? <span className="wr-small wr-muted">{empty}</span> : null;
  return <div className="wr-chips">{items.map((item, index) => <span key={item} className={tone === "avoid" ? "wr-chip-avoid" : "wr-voice-chip"} data-tone={tone === "avoid" ? undefined : index % 6}>{sentence(item)}</span>)}</div>;
}

function Trait({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wr-trait">
      <span className="wr-trait-label">{label}</span>
      <span className="wr-trait-value">{children}</span>
      <span />
    </div>
  );
}

function Traits({ profile }: { profile: VoiceProfile }) {
  const { tone, structure, language, formatting } = profile;
  const locked = new Set(profile.locked_fields);
  const head = (title: string, field: string) => (
    <h2 className="wr-trait-head">{title}{locked.has(field) && <span className="wr-locked"><Icon name="lock" size={11} />Yours</span>}</h2>
  );
  const list = (items: string[]) => (items.length ? items.map(sentence).join(" · ") : <span className="wr-muted">Not clear yet</span>);
  return (
    <>
      <div className="wr-trait-group">
        {head("Tone", "tone")}
        <Trait label="Sounds">{tone.descriptors.length ? <Chips items={tone.descriptors} /> : <span className="wr-muted">Not clear yet</span>}</Trait>
        <Trait label="Formality">{SCALE.formality[tone.formality - 1]}</Trait>
        <Trait label="Humour">{SCALE.humor[tone.humor - 1]}</Trait>
        <Trait label="Emotion">{SCALE.emotionality[tone.emotionality - 1]}</Trait>
        {tone.notes && <Trait label="Notes">{tone.notes}</Trait>}
      </div>
      <div className="wr-trait-group">
        {head("Structure", "structure")}
        <Trait label="Length">About {structure.length_words.median} words, from {structure.length_words.min} to {structure.length_words.max}</Trait>
        <Trait label="Opens with">{list(structure.hook_styles)}</Trait>
        <Trait label="Ends with">{list(structure.ending_styles)}</Trait>
        {structure.paragraphing && <Trait label="Paragraphs">{structure.paragraphing}</Trait>}
        <Trait label="Lists">{FREQUENCY[structure.uses_lists]}</Trait>
      </div>
      <div className="wr-trait-group">
        {head("Language", "language")}
        <Trait label="Writes as">{PERSON[language.person]}</Trait>
        <Trait label="Jargon">{sentence(language.jargon_level)}</Trait>
        {language.favorite_phrases.length > 0 && <Trait label="Phrases">{language.favorite_phrases.map((phrase) => `“${phrase}”`).join(" · ")}</Trait>}
        {language.avoid_words.length > 0 && <Trait label="Avoids">{<Chips items={language.avoid_words} tone="avoid" />}</Trait>}
      </div>
      <div className="wr-trait-group">
        {head("Formatting", "formatting")}
        <Trait label="Emoji">{FREQUENCY[formatting.emoji.frequency]}{formatting.emoji.favorites.length ? ` · ${formatting.emoji.favorites.join(" ")}` : ""}</Trait>
        <Trait label="Hashtags">
          {formatting.hashtags.typical_count === 0 || formatting.hashtags.placement === "none"
            ? "None"
            : `About ${formatting.hashtags.typical_count}, ${PLACEMENT[formatting.hashtags.placement]}`}
        </Trait>
        <Trait label="Links">{FREQUENCY[formatting.links]}</Trait>
        <Trait label="Mentions">{FREQUENCY[formatting.mentions]}</Trait>
      </div>
    </>
  );
}

function Rules({ profile }: { profile: VoiceProfile }) {
  const { always, never } = profile.rules;
  if (!always.length && !never.length) return null;
  return (
    <section className="wr-card wr-stack" aria-labelledby="rules-h">
      <div><h2 id="rules-h" className="wr-h2">Rules drafts follow</h2><p className="wr-sub wr-small">Concrete habits from your posts.</p></div>
      {always.length > 0 && <span className="wr-rules-head">Always</span>}
      {always.length > 0 && (
        <ul className="wr-rules" data-kind="always">{always.map((rule) => <li key={rule}><span aria-hidden="true"><Icon name="check" size={13} strokeWidth={2.6} /></span>{rule}</li>)}</ul>
      )}
      {never.length > 0 && <span className="wr-rules-head">Never</span>}
      {never.length > 0 && (
        <ul className="wr-rules" data-kind="never">{never.map((rule) => <li key={rule}><span aria-hidden="true"><Icon name="x" size={13} strokeWidth={2.6} /></span>{rule}</li>)}</ul>
      )}
    </section>
  );
}
