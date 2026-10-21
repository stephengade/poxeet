"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button, Input, Select } from "../../../../../components/ui";
import { timezoneOptions } from "../../../../../lib/timezones";
import { saveProfile, type ProfileValues } from "../../actions";

const schema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60, "Use 60 characters or fewer."),
  lastName: z.string().trim().max(60, "Use 60 characters or fewer."),
  timezone: z.string().min(1, "Pick your time zone."),
});

export function ProfileForm({ email, initial }: { email: string; initial: ProfileValues }) {
  const zones = useMemo(() => timezoneOptions(initial.timezone), [initial.timezone]);
  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });

  async function submit(values: ProfileValues) {
    const result = await saveProfile(values);
    if (!result.ok) return void toast.error(result.message);
    reset(values);
    toast.success("Profile saved.");
  }

  return (
    <form className="wr-card wr-settings-card" onSubmit={handleSubmit(submit)} noValidate>
      <div className="wr-settings-card-body wr-form-grid">
        <Input label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register("firstName")} />
        <Input label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register("lastName")} />
        <Input label="Email address" icon="mail" value={email} readOnly disabled hint="Sign-in codes go here. Ask your admin to change it." className="wr-form-wide" />
        <Controller
          control={control}
          name="timezone"
          render={({ field, fieldState }) => (
            <Select
              label="Time zone" options={zones} className="wr-form-wide"
              hint="Posting times use this zone."
              error={fieldState.error?.message}
              name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
            />
          )}
        />
      </div>
      <div className="wr-savebar" data-dirty={isDirty || undefined}>
        <span className="wr-small wr-muted">{isDirty ? "Unsaved changes" : "Your name appears on post previews."}</span>
        <span className="wr-actions">
          {isDirty && <Button variant="ghost" onClick={() => reset()}>Discard</Button>}
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save changes</Button>
        </span>
      </div>
    </form>
  );
}
