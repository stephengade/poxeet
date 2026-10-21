"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AuthHeading } from "../../../components/auth/auth-shell";
import { LinkedInLogo } from "../../../components/brand/channel-logos";
import { Button, Icon, Select, type IconName } from "../../../components/ui";
import {
  rhythmStepSchema, timezoneStepSchema, WEEKDAYS,
  type RhythmStepValues, type TimezoneStepValues,
} from "../../../lib/auth/schemas";
import { createClient } from "../../../lib/supabase/client";
import { browserTimezone, POSTING_TIMES, timezoneOptions } from "../../../lib/timezones";

type Slot = { day: (typeof WEEKDAYS)[number]; time: string };
type Props = { userId: string; firstName: string | null; lastName: string | null; email: string; timezone: string; slots: Slot[] };

const STEPS = ["Your details", "Posting rhythm", "What's next"] as const;
const DAY_LABEL: Record<Slot["day"], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const NEXT: Array<{ icon: IconName | "linkedin"; title: string; text: string }> = [
  { icon: "linkedin", title: "Connect LinkedIn", text: "So approved posts can go out on schedule." },
  { icon: "sparkle", title: "Add AI access", text: "Your own Claude key, or the instance key." },
  { icon: "voice", title: "Teach Poxeet your voice", text: "Add 3 or more of your LinkedIn posts. Poxeet learns how you write from them." },
];

/**
 * First run after sign-up. The name and email came from the invite, so nothing is asked twice:
 * confirm the details and time zone, pick a posting rhythm, then see the setup steps that remain.
 */
export function OnboardingFlow({ userId, firstName, lastName, email, timezone, slots }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const detected = useMemo(() => (timezone && timezone !== "UTC" ? timezone : browserTimezone()), [timezone]);
  const zones = useMemo(() => timezoneOptions(detected), [detected]);

  const profileForm = useForm<TimezoneStepValues>({ resolver: zodResolver(timezoneStepSchema), defaultValues: { timezone: detected } });
  const rhythmForm = useForm<RhythmStepValues>({
    resolver: zodResolver(rhythmStepSchema),
    defaultValues: { days: slots.length ? slots.map((slot) => slot.day) : ["mon", "wed", "fri"], time: slots[0]?.time ?? "09:00" },
  });

  async function save(fields: Record<string, unknown>) {
    const { error: saveError } = await createClient().from("profiles").update(fields).eq("id", userId);
    if (saveError) toast.error("We couldn't save that.", { description: "Check your connection and try again." });
    return !saveError;
  }

  async function saveProfile(values: TimezoneStepValues) {
    if (await save({ timezone: timezoneStepSchema.parse(values).timezone })) setStep(1);
  }

  async function saveRhythm(values: RhythmStepValues) {
    const ordered = WEEKDAYS.filter((day) => values.days.includes(day));
    if (await save({ posting_slots: ordered.map((day) => ({ day, time: values.time })) })) setStep(2);
  }

  async function finish() {
    setFinishing(true);
    if (await save({ onboarding_completed_at: new Date().toISOString() })) {
      toast.success(firstName ? `You're all set, ${firstName}.` : "You're all set.", { description: "Start with the first setup step. It takes a couple of minutes." });
      // Navigate only: a refresh here would re-render this page, which now redirects, and race the navigation.
      router.replace("/app");
    } else setFinishing(false);
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <div className="onboard">
      <ol className="onboard-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((label, index) => (
          <li key={label} data-state={index < step ? "done" : index === step ? "current" : undefined} aria-current={index === step ? "step" : undefined}>
            <span className="onboard-bar" /><span className="onboard-label">{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <AuthHeading title={firstName ? `Welcome, ${firstName}.` : "Welcome to"} accent={firstName ? undefined : "Poxeet."}>
            Your invite already told us who you are. Check your time zone and you&apos;re nearly done.
          </AuthHeading>
          <form className="signin-form" onSubmit={profileForm.handleSubmit(saveProfile)} noValidate>
            <dl className="onboard-details">
              {fullName && <div><dt>Name</dt><dd>{fullName}</dd></div>}
              <div><dt>Email</dt><dd>{email}</dd></div>
            </dl>
            <Controller
              control={profileForm.control}
              name="timezone"
              render={({ field, fieldState }) => (
                <Select
                  label="Your time zone" options={zones}
                  hint="Posts go out at the times you pick, in this zone. We guessed it from your browser."
                  error={fieldState.error?.message}
                  name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
                />
              )}
            />
            <Button type="submit" size="lg" iconRight="arrow-right" loading={profileForm.formState.isSubmitting}>Continue</Button>
          </form>
        </>
      )}

      {step === 1 && (
        <>
          <AuthHeading title={firstName ? `How often, ${firstName}?` : "How often should"} accent={firstName ? undefined : "you post?"}>
            Pick the days you want a post. Three a week is a steady start; Poxeet drafts a week at a time.
          </AuthHeading>
          <form className="signin-form" onSubmit={rhythmForm.handleSubmit(saveRhythm)} noValidate>
            <Controller
              control={rhythmForm.control}
              name="days"
              render={({ field, fieldState }) => (
                <fieldset className="onboard-days" aria-invalid={fieldState.error ? true : undefined}>
                  <legend className="pxt-label">Posting days</legend>
                  <div className="onboard-day-grid">
                    {WEEKDAYS.map((day) => {
                      const on = field.value.includes(day);
                      return (
                        <button
                          key={day} type="button" className="onboard-day" aria-pressed={on}
                          onClick={() => field.onChange(on ? field.value.filter((value) => value !== day) : [...field.value, day])}
                        >{DAY_LABEL[day]}</button>
                      );
                    })}
                  </div>
                  {fieldState.error
                    ? <span className="pxt-error"><Icon name="alert" size={14} />{fieldState.error.message}</span>
                    : <span className="pxt-hint">{field.value.length} {field.value.length === 1 ? "post" : "posts"} a week · about {field.value.length * 4} a month</span>}
                </fieldset>
              )}
            />
            <Controller
              control={rhythmForm.control}
              name="time"
              render={({ field, fieldState }) => (
                <Select
                  label="Time of day" options={POSTING_TIMES} searchable={false}
                  hint="Mornings on weekdays tend to reach the most people."
                  error={fieldState.error?.message}
                  name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
                />
              )}
            />
            <div className="onboard-actions">
              <Button variant="ghost" icon="chevron-left" onClick={() => setStep(0)}>Back</Button>
              <Button type="submit" size="lg" iconRight="arrow-right" loading={rhythmForm.formState.isSubmitting}>Continue</Button>
            </div>
          </form>
        </>
      )}

      {step === 2 && (
        <>
          <AuthHeading title="You're in." accent="Here's what's next.">Three steps get your first month ready. They stay on your home page until they&apos;re done.</AuthHeading>
          <div className="signin-form">
            <ol className="onboard-next">
              {NEXT.map((item, index) => (
                <li key={item.title}>
                  <span className="onboard-next-icon">{item.icon === "linkedin" ? <LinkedInLogo size={18} /> : <Icon name={item.icon} size={18} />}</span>
                  <span><strong>{index + 1}. {item.title}</strong><span>{item.text}</span></span>
                </li>
              ))}
            </ol>
            <p className="signin-fine"><Icon name="shield" size={14} /> Nothing is ever posted until you approve it.</p>
            <div className="onboard-actions">
              <Button variant="ghost" icon="chevron-left" onClick={() => setStep(1)}>Back</Button>
              <Button size="lg" iconRight="arrow-right" loading={finishing} onClick={finish}>Go to my workspace</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
