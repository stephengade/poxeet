"use client";

import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button, Switch } from "../../../../../components/ui";
import { EMAIL_PREFERENCES, type EmailPreferences } from "../../../../../lib/email-preferences";
import { saveEmailPreferences } from "../../actions";

export function NotificationsForm({ initial }: { initial: EmailPreferences }) {
  const { control, handleSubmit, reset, formState: { isSubmitting, isDirty } } = useForm<EmailPreferences>({ defaultValues: initial });

  async function submit(values: EmailPreferences) {
    const result = await saveEmailPreferences(values);
    if (!result.ok) return void toast.error(result.message);
    reset(values);
    toast.success("Notification settings saved.");
  }

  return (
    <form className="wr-card wr-settings-card" onSubmit={handleSubmit(submit)} noValidate>
      <div className="wr-settings-card-head"><h3 className="wr-h2">Email me when</h3></div>
      <ul className="wr-toggles">
        {EMAIL_PREFERENCES.map((item) => {
          const name = item.kind === "postFailed" ? null : item.kind;
          return (
            <li key={item.kind}>
              <span>
                <strong>{item.title}{item.soon && <span className="wr-channel-status" data-state="soon">Soon</span>}</strong>
                <span className="wr-small wr-muted">{item.column ? item.hint : `${item.hint} Always on.`}</span>
              </span>
              {name ? (
                <Controller control={control} name={name} render={({ field }) => (
                  <Switch aria-label={item.title} checked={field.value} onChange={field.onChange} />
                )} />
              ) : (
                <Switch aria-label={item.title} checked={!item.column} disabled />
              )}
            </li>
          );
        })}
      </ul>
      <div className="wr-savebar" data-dirty={isDirty || undefined}>
        <span className="wr-small wr-muted">{isDirty ? "Unsaved changes" : "Changes apply from the next email."}</span>
        <span className="wr-actions">
          {isDirty && <Button variant="ghost" onClick={() => reset()}>Discard</Button>}
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save</Button>
        </span>
      </div>
    </form>
  );
}
