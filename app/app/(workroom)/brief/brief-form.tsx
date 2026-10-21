"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { SkyBand } from "../../../../components/preview/parts";
import { Icon } from "../../../../components/ui";
import { BRIEF_LANGUAGES, briefSchema, type Brief } from "../../../../lib/brief";
import { saveBrief } from "./actions";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function TagInput({ id, label, hint, tags, onChange, tone, placeholder, error }: {
  id: string; label: string; hint?: string; tags: string[]; onChange: (next: string[]) => void; tone: "brand" | "avoid"; placeholder: string; error?: string;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const value = draft.trim().replace(/,$/, "");
    if (value && !tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) onChange([...tags, value]);
    setDraft("");
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
      event.preventDefault();
      add();
    }
    if (event.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
  }
  return (
    <div className="wr-field">
      <label htmlFor={id}>{label}</label>
      <div className="wr-tags">
        {tags.map((tag) => (
          <span key={tag} className="wr-tag-chip" data-tone={tone}>
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(tags.filter((item) => item !== tag))}><Icon name="x" size={10} strokeWidth={2.6} /></button>
          </span>
        ))}
        <input id={id} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKey} onBlur={add} />
      </div>
      {error ? <span className="wr-field-error">{error}</span> : hint ? <span className="wr-field-hint">{hint}</span> : null}
    </div>
  );
}

/** The brief, as one form: about you, topics, language. Saving makes the next plan use it. */
export function BriefForm({ initial, savedAt, suggested, postsPerWeek }: { initial: Brief; savedAt: string | null; suggested: string[]; postsPerWeek: number }) {
  const router = useRouter();
  const [saved, setSaved] = useState(savedAt);
  const { control, register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<Brief>({ resolver: zodResolver(briefSchema), defaultValues: initial });
  const topics = useWatch({ control, name: "topics" });

  async function submit(values: Brief) {
    const result = await saveBrief(values);
    if (!result.ok) return void toast.error(result.message);
    setSaved(result.savedAt);
    reset(values);
    toast.success("Brief saved.", {
      description: "Your next plan uses it.",
      action: { label: "Plan a month", onClick: () => router.push("/app/calendar?plan=1") },
      duration: 8_000,
    });
  }

  const total = postsPerWeek * 4;
  const mix = topics.map((topic, index) => [topic, Math.floor(total / topics.length) + (index < total % topics.length ? 1 : 0)] as const);
  const most = Math.max(1, ...mix.map(([, count]) => count));
  const offered = suggested.map(sentence).filter((item) => !topics.some((topic) => topic.toLowerCase() === item.toLowerCase())).slice(0, 6);

  return (
    <form className="wr-page" onSubmit={handleSubmit(submit)} noValidate>
      <SkyBand className="wr-band">
        <div className="wr-band-text">
          <p className="wr-sky-kicker">Brief</p>
          <h1 className="wr-band-title">Where you want your posts to take you</h1>
          <p className="wr-sky-sub">Your past posts show how you write. The brief says who you write for and what you want from it.</p>
        </div>
        <div className="wr-sky-actions">
          {saved && <span className="wr-band-saved">{isDirty ? "Unsaved changes" : `Saved ${DATE.format(new Date(saved))}`}</span>}
          <button type="submit" className="wr-btn-white" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save brief"}</button>
        </div>
      </SkyBand>

      <div className="wr-split">
        <div className="wr-split-main wr-stack">
          <section className="wr-card wr-stack wr-brief-section" aria-labelledby="b1">
            <h2 id="b1" className="wr-step-title"><span>1</span>About you</h2>
            <label className="wr-field">What you do
              <input placeholder="e.g. Product lead at a B2B software company" aria-invalid={errors.profession ? true : undefined} {...register("profession")} />
              {errors.profession && <span className="wr-field-error">{errors.profession.message}</span>}
            </label>
            <label className="wr-field">Who you write for
              <textarea rows={2} placeholder="e.g. Founders and first-time product managers" aria-invalid={errors.audience ? true : undefined} {...register("audience")} />
              <span className="wr-field-hint">The people you want reading your posts.</span>
            </label>
            <label className="wr-field">What you want from posting
              <textarea rows={2} placeholder="e.g. Be known for practical product advice; meet more founders" aria-invalid={errors.goals ? true : undefined} {...register("goals")} />
              <span className="wr-field-hint">One or two goals work best.</span>
            </label>
          </section>

          <section className="wr-card wr-stack wr-brief-section" aria-labelledby="b2">
            <h2 id="b2" className="wr-step-title"><span>2</span>Topics</h2>
            <Controller control={control} name="topics" render={({ field, fieldState }) => (
              <TagInput id="topics" label="Write about" tags={field.value} onChange={field.onChange} tone="brand" placeholder="Add a topic, then Enter"
                hint="These become the month's themes." error={fieldState.error?.message} />
            )} />
            {offered.length > 0 && (
              <Controller control={control} name="topics" render={({ field }) => (
                <div className="wr-suggest"><span>Found in your posts:</span>{offered.map((item) => <button key={item} type="button" onClick={() => field.onChange([...field.value, item])}>+ {item}</button>)}</div>
              )} />
            )}
            <Controller control={control} name="off_limits" render={({ field, fieldState }) => (
              <TagInput id="avoid" label="Never write about" tags={field.value} onChange={field.onChange} tone="avoid" placeholder="Add a topic to avoid"
                hint="Every draft is checked against these." error={fieldState.error?.message} />
            )} />
          </section>

          <section className="wr-card wr-stack wr-brief-section" aria-labelledby="b3">
            <h2 id="b3" className="wr-step-title"><span>3</span>Language</h2>
            <Controller control={control} name="language" render={({ field }) => (
              <div className="wr-radio-pills" role="radiogroup" aria-labelledby="b3">
                {BRIEF_LANGUAGES.map((item) => (
                  <button key={item} type="button" role="radio" aria-checked={field.value === item} onClick={() => field.onChange(item)}><span aria-hidden="true" />{item}</button>
                ))}
              </div>
            )} />
          </section>
        </div>

        <div className="wr-split-side">
          <section className="wr-card wr-stack wr-tinted" aria-labelledby="how-h">
            <h2 id="how-h" className="wr-h2">How Poxeet uses this</h2>
            <ul className="wr-ticks">
              <li><Icon name="check" size={16} strokeWidth={2.2} />Topics become the month&apos;s themes, spread across weeks.</li>
              <li><Icon name="check" size={16} strokeWidth={2.2} />Your audience and goals shape each post&apos;s angle.</li>
              <li><Icon name="check" size={16} strokeWidth={2.2} />Every draft is checked against the topics to avoid.</li>
            </ul>
          </section>
          {mix.length > 0 && (
            <section className="wr-card wr-stack" aria-labelledby="mix-h">
              <h2 id="mix-h" className="wr-h2">A month at a glance</h2>
              <p className="wr-small wr-muted" style={{ margin: 0 }}>With {postsPerWeek} posts a week, four weeks could look like:</p>
              <ul className="wr-mix">
                {mix.map(([topic, count]) => <li key={topic}><span>{topic}</span><span className="wr-mix-bar"><span style={{ width: `${(count / most) * 100}%` }} /></span><span className="wr-mono">{count}</span></li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </form>
  );
}
