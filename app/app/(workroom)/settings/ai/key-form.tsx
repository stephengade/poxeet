"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button, Icon, Input, Select } from "../../../../../components/ui";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../../../../../lib/ai/providers";
import { removeAiKey, saveAiKey } from "./actions";

const schema = z.object({
  provider: z.enum(PROVIDER_IDS),
  apiKey: z.string().trim().min(1, "Paste your API key."),
});
type Values = z.input<typeof schema>;

const OPTIONS = PROVIDER_IDS.map((id) => ({ value: id, label: `${PROVIDERS[id].label} (${PROVIDERS[id].vendor})` }));

type Saved = { provider: ProviderId; last4: string; checkedAt: string | null } | null;

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The member's own key: its status, and a form to add, replace or remove it. */
export function KeyForm({ saved, next }: { saved: Saved; next?: { label: string; href: string } | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!saved);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, startRemove] = useTransition();
  const { control, register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { provider: saved?.provider ?? "anthropic", apiKey: "" },
  });
  const provider = PROVIDERS[useWatch({ control, name: "provider" }) as ProviderId];

  async function submit(values: Values) {
    const result = await saveAiKey(values);
    if (!result.ok) {
      if (result.field) setError("apiKey", { message: result.message }, { shouldFocus: true });
      else toast.error(result.message);
      return;
    }
    toast.success(`${PROVIDERS[values.provider].label} key saved.`, {
      description: `It works. Only the last 4 characters, ${result.last4}, are shown from now on.`,
      ...(next ? { action: { label: next.label, onClick: () => router.push(next.href) }, duration: 10_000 } : {}),
    });
    reset({ provider: values.provider, apiKey: "" });
    setEditing(false);
  }

  function remove() {
    if (!confirmRemove) return setConfirmRemove(true);
    startRemove(async () => {
      const result = await removeAiKey();
      setConfirmRemove(false);
      if (!result.ok) return void toast.error(result.message);
      toast.success("Key removed.", { description: "Poxeet won't use it again." });
      setEditing(true);
    });
  }

  return (
    <div className="wr-stack">
      {saved && (
        <section className="wr-card wr-settings-card">
          <div className="wr-settings-card-head wr-settings-card-row">
            <div>
              <h3 className="wr-h2">Your {PROVIDERS[saved.provider].label} key</h3>
              <p className="wr-sub wr-small">
                <span className="wr-mono">••••{saved.last4}</span>
                {saved.checkedAt ? ` · checked ${DATE.format(new Date(saved.checkedAt))}` : ""} · stored encrypted
              </p>
            </div>
            <span className="wr-actions">
              {!editing && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Replace</Button>}
              <Button variant={confirmRemove ? "destructive" : "ghost"} size="sm" loading={removing} onClick={remove} onBlur={() => setConfirmRemove(false)}>
                {confirmRemove ? "Click again to remove" : "Remove"}
              </Button>
            </span>
          </div>
        </section>
      )}

      {editing && (
        <form className="wr-card wr-settings-card" onSubmit={handleSubmit(submit)} noValidate>
          <div className="wr-settings-card-head">
            <h3 className="wr-h2">{saved ? "Replace your key" : "Add your own key"}</h3>
            <p className="wr-sub wr-small">We check it with the provider before saving. It&apos;s stored encrypted and never shown in full again.</p>
          </div>
          <div className="wr-settings-card-body wr-form-grid">
            <Controller
              control={control}
              name="provider"
              render={({ field }) => (
                <Select label="Provider" options={OPTIONS} className="wr-form-wide"
                  name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
              )}
            />
            <Input
              label="API key" icon="lock" type="password" autoComplete="off" spellCheck={false} className="wr-form-wide"
              placeholder={`${provider.keyPrefix}…`}
              hint={<>Create one in your <a href={provider.keysUrl} target="_blank" rel="noreferrer" className="wr-link">{provider.vendor} console</a>. Usage is billed to your {provider.vendor} account.</>}
              error={errors.apiKey?.message}
              {...register("apiKey")}
            />
            <p className="wr-form-wide wr-ai-note"><Icon name="info" size={14} />{provider.dataNote}</p>
          </div>
          <div className="wr-savebar" data-dirty>
            <span className="wr-small wr-muted">Checking takes a few seconds.</span>
            <span className="wr-actions">
              {saved && <Button variant="ghost" onClick={() => { reset(); setEditing(false); }}>Cancel</Button>}
              <Button type="submit" loading={isSubmitting}>{isSubmitting ? "Checking key" : "Check and save"}</Button>
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
