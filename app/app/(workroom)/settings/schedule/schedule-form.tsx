"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button, Icon, Select } from "../../../../../components/ui";
import { rhythmStepSchema, WEEKDAYS, type RhythmStepValues } from "../../../../../lib/auth/schemas";
import { POSTING_TIMES } from "../../../../../lib/timezones";
import { saveSchedule } from "../../actions";

const DAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export function ScheduleForm({ initial, timezone }: { initial: RhythmStepValues; timezone: string }) {
  const { control, handleSubmit, reset, formState: { isSubmitting, isDirty } } = useForm<RhythmStepValues>({
    resolver: zodResolver(rhythmStepSchema),
    defaultValues: initial,
  });

  async function submit(values: RhythmStepValues) {
    const result = await saveSchedule(values);
    if (!result.ok) return void toast.error(result.message);
    reset(values);
    toast.success("Schedule saved.", { description: "New drafts use this rhythm. Approved posts keep their times." });
  }

  return (
    <form className="wr-card wr-settings-card" onSubmit={handleSubmit(submit)} noValidate>
      <div className="wr-settings-card-body wr-form-grid">
        <Controller
          control={control}
          name="days"
          render={({ field, fieldState }) => (
            <fieldset className="onboard-days wr-form-wide" aria-invalid={fieldState.error ? true : undefined}>
              <legend className="pxt-label">Posting days</legend>
              <div className="onboard-day-grid">
                {WEEKDAYS.map((day) => {
                  const on = field.value.includes(day);
                  return (
                    <button key={day} type="button" className="onboard-day" aria-pressed={on}
                      onClick={() => field.onChange(on ? field.value.filter((value) => value !== day) : [...field.value, day])}>
                      {DAY_LABEL[day]}
                    </button>
                  );
                })}
              </div>
              {fieldState.error
                ? <span className="pxt-error"><Icon name="alert" size={14} />{fieldState.error.message}</span>
                : <span className="pxt-hint">{field.value.length} {field.value.length === 1 ? "post" : "posts"} a week. Most people keep 2 to 3.</span>}
            </fieldset>
          )}
        />
        <Controller
          control={control}
          name="time"
          render={({ field, fieldState }) => (
            <Select
              label="Time of day" options={POSTING_TIMES} searchable={false}
              hint={`Every slot uses this time, in ${timezone.replaceAll("_", " ")}.`}
              error={fieldState.error?.message}
              name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
            />
          )}
        />
      </div>
      <div className="wr-savebar" data-dirty={isDirty || undefined}>
        <span className="wr-small wr-muted">{isDirty ? "Unsaved changes" : "Change the time zone in Profile."}</span>
        <span className="wr-actions">
          {isDirty && <Button variant="ghost" onClick={() => reset()}>Discard</Button>}
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save schedule</Button>
        </span>
      </div>
    </form>
  );
}
