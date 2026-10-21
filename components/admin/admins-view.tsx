"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { CODE_MIN, codeProblem } from "../../lib/admin/code-rules";
import type { AdminActions, AdminPerson } from "../../lib/admin/types";
import { Button, Icon } from "../ui";
import { AdminHead, AdminSheet, formatWhen, MemberWho, SheetSection } from "./admin-ui";

// Admins (D-032): who can open this dashboard, your own access code, and inviting, disabling or resetting
// another admin. Admin accounts are admin only; they have no member workspace.

const STATUS: Record<AdminPerson["status"], { label: string; kind: string }> = {
  active: { label: "Active", kind: "active" },
  invited: { label: "Invited", kind: "waiting" },
  disabled: { label: "Disabled", kind: "suspended" },
};

/** A random code of digits that passes the rules, made in the browser. */
function generateCode(length = CODE_MIN + 2) {
  let code = "";
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    code = Array.from(bytes).filter((byte) => byte < 250).slice(0, length).map((byte) => String(byte % 10)).join("");
  } while (code.length < length || codeProblem(code));
  return code;
}

function CodeField({ id, label, value, onChange, hint, generate, autoComplete = "off" }: {
  id: string; label: string; value: string; onChange: (value: string) => void; hint?: string; generate?: boolean; autoComplete?: string;
}) {
  const problem = value ? codeProblem(value) : null;
  return (
    <label className="wr-field" htmlFor={id}>{label}
      <span className="wr-admin-code-input">
        <input id={id} type="password" inputMode="numeric" autoComplete={autoComplete} value={value} maxLength={32}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(problem) || undefined} />
        {generate && <Button type="button" variant="secondary" size="sm" onClick={() => onChange(generateCode())}>Generate</Button>}
      </span>
      <span className={problem ? "wr-field-error" : "wr-field-hint"}>{problem ?? hint ?? `Digits only, at least ${CODE_MIN}.`}</span>
    </label>
  );
}

function Reveal({ code }: { code: string }) {
  if (!code) return null;
  return (
    <p className="wr-admin-reveal">
      <span className="wr-mono">{code}</span>
      <button type="button" className="wr-icon-btn" aria-label="Copy the code" title="Copy" onClick={() => navigator.clipboard.writeText(code).then(() => toast.success("Code copied."), () => toast.error("Couldn't copy. Select it and copy it yourself."))}>
        <Icon name="copy" size={16} />
      </button>
    </p>
  );
}

function InviteAdminSheet({ actions, signupUrl, onClose }: { actions: AdminActions; signupUrl: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const result = await actions.inviteAdmin({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), code });
      if (!result.ok) return setError(result.message);
      toast.success("Admin invited.", { description: "Send them the sign-up link and, separately, the starting code." });
      router.refresh();
      onClose();
    });
  }

  return (
    <AdminSheet
      title="Invite an admin"
      sub="Admins can open this dashboard and nothing else: an admin email has no member workspace."
      onClose={onClose}
      foot={<>
        <span className="wr-small wr-muted">Nothing is emailed. You share the link and code.</span>
        <span className="wr-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="admin-invite-admin" icon="shield" loading={pending} disabled={Boolean(codeProblem(code))}>Invite admin</Button></span>
      </>}
    >
      <form id="admin-invite-admin" className="wr-stack" onSubmit={submit} onChange={() => setError(null)}>
        <label className="wr-field">Name<input name="name" type="text" autoComplete="off" required maxLength={80} /></label>
        <label className="wr-field">Email<input name="email" type="email" autoComplete="off" placeholder="name@company.com" required /></label>
        <CodeField id="invite-admin-code" label="Starting access code" value={code} onChange={setCode} generate hint="They enter it once at sign-up, then choose their own." />
        <Reveal code={code} />
        {error && <p className="wr-field-error" role="alert">{error}</p>}
      </form>
      <SheetSection title="How they join" hint="Send the code by a different channel from the link, so one leaked message isn't enough.">
        <ol className="wr-admin-steps">
          <li>They open <span className="wr-mono">{signupUrl}</span> and enter their email.</li>
          <li>They type the 6-digit code we email them.</li>
          <li>They enter your starting code, then choose a new one of their own.</li>
        </ol>
      </SheetSection>
    </AdminSheet>
  );
}

function ResetSheet({ person, actions, onClose }: { person: AdminPerson; actions: AdminActions; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  function save() {
    start(async () => {
      const result = await actions.resetAdminCode(person.id, code);
      if (!result.ok) return void toast.error(result.message);
      toast.success(`${person.name.split(" ")[0]}'s code is reset.`, { description: "Share the new code with them; they replace it at their next sign-in." });
      router.refresh();
      onClose();
    });
  }
  return (
    <AdminSheet title={`Reset ${person.name}'s code`} sub="Their current code stops working at once. They sign in with this one and choose their own." onClose={onClose}
      foot={<>
        <span className="wr-small wr-muted">Logged in the audit log.</span>
        <span className="wr-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending} disabled={Boolean(codeProblem(code))}>Reset code</Button></span>
      </>}
    >
      <CodeField id="reset-code" label="New starting code" value={code} onChange={setCode} generate />
      <Reveal code={code} />
    </AdminSheet>
  );
}

function MyCode({ actions }: { actions: AdminActions }) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const mismatch = again.length > 0 && again !== next;
  const ready = current.length > 0 && !codeProblem(next) && next === again;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    start(async () => {
      const result = await actions.changeMyCode(current, next);
      if (!result.ok) return void toast.error(result.message);
      toast.success("Your access code is changed.", { description: "Use the new one next time you sign in." });
      setCurrent(""); setNext(""); setAgain("");
    });
  }

  return (
    <form className="wr-card wr-settings-card" onSubmit={submit}>
      <div className="wr-settings-card-head"><h2 className="wr-h2">Your access code</h2><p className="wr-sub wr-small">Asked after the emailed code whenever you sign in to this dashboard. Only a hash of it is stored.</p></div>
      <div className="wr-settings-card-body wr-form-grid wr-admin-code-grid">
        <CodeField id="my-current" label="Current code" value={current} onChange={setCurrent} hint="The code you signed in with." autoComplete="current-password" />
        <CodeField id="my-next" label="New code" value={next} onChange={setNext} autoComplete="new-password" />
        <label className="wr-field" htmlFor="my-again">Type it again
          <input id="my-again" type="password" inputMode="numeric" autoComplete="new-password" value={again} maxLength={32} onChange={(event) => setAgain(event.target.value.replace(/\D/g, ""))} aria-invalid={mismatch || undefined} />
          <span className={mismatch ? "wr-field-error" : "wr-field-hint"}>{mismatch ? "The two codes don't match." : "To be sure."}</span>
        </label>
      </div>
      <div className="wr-savebar"><span className="wr-small wr-muted">You stay signed in.</span><Button type="submit" loading={pending} disabled={!ready}>Change code</Button></div>
    </form>
  );
}

export function AdminsView({ admins, actions, timeZone, now, signupUrl }: { admins: AdminPerson[]; actions: AdminActions; timeZone: string; now: number; signupUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState<AdminPerson | null>(null);

  function toggle(person: AdminPerson) {
    const disable = person.status !== "disabled";
    if (disable && !window.confirm(`Disable ${person.name}? They're signed out of the dashboard at once.`)) return;
    start(async () => {
      const result = await actions.setAdminDisabled(person.id, disable);
      if (!result.ok) return void toast.error(result.message);
      toast.success(disable ? `${person.name} can no longer open the dashboard.` : `${person.name} can sign in again.`);
      router.refresh();
    });
  }

  return (
    <>
      <AdminHead page="admins" actions={<Button icon="plus" onClick={() => setInviting(true)}>Invite an admin</Button>}>
        Who can open this dashboard. Each admin signs in with the emailed code and then their own access code.
      </AdminHead>

      <section className="wr-card wr-table-card">
        <div className="wr-admin-toolbar"><h2 className="wr-h2">Admins</h2></div>
        <ul className="wr-admin-list wr-admin-people" aria-label="Admins">
          <li className="wr-admin-list-head" aria-hidden="true"><span>Admin</span><span>Last sign-in</span><span>Invited by</span><span>Status</span><span /></li>
          {admins.map((person) => {
            const last = person.lastSignIn ? formatWhen(person.lastSignIn, timeZone, now) : null;
            return (
              <li key={person.id}>
                <div className="wr-admin-row">
                  <MemberWho member={person} />
                  <span className="wr-admin-cell-ai"><span className="wr-small">{last ? `${last.day}, ${last.time}` : "Never"}</span></span>
                  <span className="wr-admin-cell-usage"><span className="wr-small wr-muted">{person.invitedBy ?? "Set up from the server"}</span></span>
                  <span className="wr-admin-cell-status">
                    <span className="wr-tag" data-kind={STATUS[person.status].kind}>{STATUS[person.status].label}</span>
                    {person.mustChangeCode && person.status !== "disabled" && <span className="wr-small wr-muted">On a starting code</span>}
                  </span>
                  <span className="wr-admin-row-actions">
                    {!person.you && person.status !== "disabled" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => setResetting(person)}>Reset code</Button>}
                    {!person.you && (
                      <button type="button" className="wr-icon-btn" disabled={pending} onClick={() => toggle(person)}
                        aria-label={person.status === "disabled" ? `Enable ${person.name}` : `Disable ${person.name}`} title={person.status === "disabled" ? "Enable" : "Disable"}>
                        <Icon name={person.status === "disabled" ? "refresh" : "pause"} size={16} />
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <MyCode actions={actions} />

      {inviting && <InviteAdminSheet actions={actions} signupUrl={signupUrl} onClose={() => setInviting(false)} />}
      {resetting && <ResetSheet key={resetting.id} person={resetting} actions={actions} onClose={() => setResetting(null)} />}
    </>
  );
}
