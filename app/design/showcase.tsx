"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppBar } from "../../components/app-bar";
import { Logo } from "../../components/brand/logo";
import { CalendarMonth } from "../../components/calendar/calendar-month";
import { CalendarList, CalendarRow } from "../../components/calendar/calendar-row";
import { SAMPLE_AUTHOR, SAMPLE_MONTH, SAMPLE_POSTS, SAMPLE_TODAY } from "../../components/marketing/sample-calendar";
import { PostChip } from "../../components/post/post-chip";
import { PostPreview } from "../../components/post/post-preview";
import { Badge, Banner, Button, Card, CodeInput, EmptyState, Eyebrow, Icon, ICON_NAMES, Input, Modal, Select, Skeleton, Stepper, Switch, Tabs, Textarea, Toast } from "../../components/ui";
import type { PostStatus } from "../../lib/post-status";

const STATUSES: PostStatus[] = ["draft", "approved", "posting", "posted", "failed", "skipped", "needs_check", "missed"];
const COLORS = ["canvas", "surface", "surface-muted", "line", "line-strong", "ink", "ink-muted", "action", "brand", "brand-soft", "success", "success-soft", "warning", "warning-soft", "danger", "danger-soft", "wash-cool", "wash-warm"];
const TYPE = ["display-xl", "display-lg", "display-md", "heading-lg", "heading-md", "heading-sm", "body-lg", "body", "body-sm", "label", "eyebrow", "mono"];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ display: "grid", gap: "var(--space-4)", paddingBlock: "var(--space-8)", borderTop: "1px solid var(--line)" }}>
      <h2 className="type-heading-md" style={{ margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

const row = { display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center" } as const;

export function Showcase() {
  const [theme, setTheme] = useState("system");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);

  return (
    <div className="workroom">
      <AppBar
        current="calendar"
        items={[{ id: "calendar", label: "Calendar", icon: "calendar", href: "/design#calendar" }, { id: "voice", label: "Voice", icon: "voice", href: "/design#post" }, { id: "import", label: "Import", icon: "upload", href: "/design#forms" }]}
        connection={{ state: "connected", label: "LinkedIn · 52 days" }}
        paused={paused}
        onPauseChange={setPaused}
      />
      <main className="workroom-main">
        <div className="workroom-head" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "end" }}>
          <div>
            <Eyebrow>Design system</Eyebrow>
            <h1 className="type-display-md" style={{ margin: "var(--space-4) 0 var(--space-2)" }}>Poxeet, <span className="type-voice-lg">in pieces</span>.</h1>
            <p>Every token and component from design-tokens.json and /components, live. Sample content only.</p>
          </div>
          <Tabs aria-label="Theme" value={theme} onChange={setTheme} items={[{ id: "system", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} />
        </div>

        <Section id="logo" title="Logo">
          <div style={row}>
            <Logo size={40} />
            <Logo size={40} tone="brand" />
            <Logo variant="wordmark" size={40} />
            <Logo variant="mark" size={64} />
            <Logo variant="mark" size={26} />
            <span style={{ padding: 16, borderRadius: "var(--radius-lg)", background: "var(--action)" }}><Logo size={32} tone="inverse" /></span>
          </div>
        </Section>

        <Section id="color" title="Color">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--space-3)" }}>
            {COLORS.map((name) => (
              <div key={name} style={{ display: "grid", gap: 6 }}>
                <span style={{ height: 56, borderRadius: "var(--radius-md)", background: `var(--${name})`, border: "1px solid var(--line)" }} />
                <code className="type-body-sm">{name}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" title="Type">
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            {TYPE.map((name) => (
              <div key={name} style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: "var(--space-4)", alignItems: "baseline" }}>
                <code className="type-body-sm" style={{ color: "var(--ink-muted)" }}>{name}</code>
                <span className={`type-${name}`} style={{ overflowWrap: "anywhere" }}>
                  {name.startsWith("display") ? <>A month of posts that <span className={name === "display-xl" ? "type-voice-xl" : "type-voice-lg"}>sound like you</span>.</> : name === "mono" ? "09:00 · 2,184 / 3,000" : "Most people never post because the blank box wins."}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="icons" title="Icons">
          <div style={{ ...row, gap: "var(--space-4)" }}>{ICON_NAMES.map((name) => <span key={name} title={name}><Icon name={name} size={20} /></span>)}</div>
        </Section>

        <Section id="actions" title="Buttons and badges">
          <div style={row}>
            <Button>Approve</Button>
            <Button variant="brand" iconRight="arrow-right">Get started</Button>
            <Button variant="secondary" icon="copy">Copy to clipboard</Button>
            <Button variant="ghost" icon="refresh">Regenerate</Button>
            <Button variant="destructive" icon="skip">Stop this post</Button>
            <Button loading>Saving</Button>
            <Button disabled>Approve</Button>
            <Button size="sm" variant="ghost" icon="chevron-left" aria-label="Previous month" />
          </div>
          <div style={row}>{STATUSES.map((status) => <Badge key={status} status={status} />)}</div>
          <div style={row}>
            <Eyebrow arrow href="/design">Open source · self-hostable</Eyebrow>
            <Eyebrow tone="quiet">How it works</Eyebrow>
            <Badge tone="brand" icon="voice">Voice v3 active</Badge>
            <Badge tone="success">Connected</Badge>
          </div>
        </Section>

        <Section id="forms" title="Forms">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-6)" }}>
            <div style={{ display: "grid", gap: "var(--space-4)", alignContent: "start" }}>
              <Input label="Email" icon="mail" type="email" placeholder="you@example.com" hint="We'll send a six-digit code." />
              <Input label="Access code" icon="lock" defaultValue="CODE" error="Access codes are 4 to 32 letters, numbers or dashes." />
              <CodeSample />
              <Select label="Posts per week" defaultValue="3" options={["1", "2", "3", "4", "5"]} />
              <Select label="Timezone" defaultValue="Africa/Lagos" hint="More than 10 options, so it's searchable." options={SAMPLE_ZONES} />
              <div style={row}><Switch label="Email me before LinkedIn disconnects" defaultChecked /></div>
            </div>
            <Textarea label="Post text" defaultValue={SAMPLE_POSTS[5].text} hint="Editing an approved post sends it back to draft." />
          </div>
        </Section>

        <Section id="feedback" title="Feedback">
          <div style={{ display: "grid", gap: "var(--space-3)", maxWidth: 680 }}>
            <Banner tone="info" title="Publishing is paused." action={<Button size="sm" variant="secondary">Resume</Button>}>Approved posts stay approved and go out when you resume.</Banner>
            <Banner tone="warning" title="LinkedIn disconnects in 6 days." action={<Button size="sm">Reconnect</Button>}>Reconnect now so Thursday&apos;s post goes out on time.</Banner>
            <Banner tone="critical" title="One post failed to send.">LinkedIn rejected the text on Tue 13 Oct. Edit it and approve it again.</Banner>
            <Banner tone="success" title="Connected as Amara Okoye." />
          </div>
          <div style={row}><Toast icon="check" actionLabel="Undo">Approved 3 posts</Toast><Toast icon="copy">Copied to clipboard</Toast></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-6)" }}>
            <EmptyState title="No posts planned yet" action={<Button>Generate a calendar</Button>}>Pick a start date and how often you want to post.</EmptyState>
            <Card title="Loading"><div style={{ display: "grid", gap: "var(--space-4)" }}><Skeleton width={48} height={48} radius="full" /><Skeleton lines={3} /></div></Card>
          </div>
        </Section>

        <Section id="containers" title="Containers">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-6)", alignItems: "start" }}>
            <Card title="Get set up" description="These steps stay here until they're done.">
              <Stepper steps={[
                { title: "Connect LinkedIn", description: "Connected as Amara Okoye · 59 days left", state: "done" },
                { title: "Add AI access", description: "Your own Claude key, or credits.", state: "current", action: <Button size="sm">Add a key</Button> },
                { title: "Import your posts", description: "Upload Shares.csv or paste posts." },
              ]} />
            </Card>
            <Modal inline title="Stop this post?" actions={<><Button variant="secondary">Keep it</Button><Button variant="destructive" icon="skip">Stop this post</Button></>}>
              It moves to Skipped and is never sent. You can restore it to draft later.
            </Modal>
          </div>
        </Section>

        <Section id="post" title="Post">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-6)", alignItems: "start" }}>
            <PostPreview author={SAMPLE_AUTHOR} when="Wed 09:00" text={SAMPLE_POSTS[5].text} />
            <div style={{ display: "grid", gap: 6, maxWidth: 240 }}>
              {SAMPLE_POSTS.slice(3, 9).map((post) => <PostChip key={post.id} time={post.time} text={post.text} status={post.status} />)}
            </div>
          </div>
        </Section>

        <Section id="calendar" title="Calendar">
          <CalendarMonth defaultMonth={SAMPLE_MONTH} today={SAMPLE_TODAY} posts={SAMPLE_POSTS} defaultSelected={SAMPLE_TODAY} />
          <CalendarList>
            {SAMPLE_POSTS.slice(3, 8).map((post) => <CalendarRow key={post.id} date={post.date} time={post.time} text={post.text} status={post.status} pillar="Product" postType="Story" />)}
          </CalendarList>
        </Section>
      </main>
    </div>
  );
}

function CodeSample() {
  const [code, setCode] = useState("482");
  return <CodeInput label="6-digit code" hint="Sent to st•••@gmail.com." value={code} onChange={setCode} />;
}

const SAMPLE_ZONES = [
  "Africa/Accra", "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi", "America/Chicago", "America/Los_Angeles",
  "America/New_York", "America/Sao_Paulo", "America/Toronto", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Europe/Berlin", "Europe/London", "Europe/Madrid", "Europe/Paris", "UTC",
].map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));
