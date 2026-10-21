"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import type { AdminActions, AdminInvite, InviteHow } from "../../lib/admin/types";
import { Button, Icon, Switch } from "../ui";
import { AdminHead, AdminSheet, MemberWho, SheetSection, shortDate } from "./admin-ui";

// Access list: whether anyone can sign up, and who is invited (PRD AUTH-1, ADM-1). Replaces `pnpm invite`.

const HOW: Record<InviteHow, string> = { all: "Email or code", code: "Access code only", email: "Email only" };
const STATE: Record<AdminInvite["state"], { label: string; kind: string }> = {
  joined: { label: "Joined", kind: "active" },
  waiting: { label: "Not joined yet", kind: "waiting" },
  expired: { label: "Code expired", kind: "expired" },
};
const EXPIRY: Array<[string, string]> = [["7d", "7 days"], ["30d", "30 days"], ["3m", "3 months"], ["never", "No expiry"]];

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error("Couldn't copy. Select the code and copy it yourself.");
  }
}

function InviteSheet({ actions, onClose }: { actions: AdminActions; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [how, setHow] = useState<InviteHow>("all");
  const [expiry, setExpiry] = useState("30d");
  const [instanceKey, setInstanceKey] = useState(false);
  const [send, setSend] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const result = await actions.invite({
        firstName: String(form.get("firstName") ?? ""), lastName: String(form.get("lastName") ?? ""), email: String(form.get("email") ?? ""),
        how, expiry, instanceKey, send,
      });
      if (!result.ok) return setError(result.message);
      if (result.message) toast.warning(result.message);
      else toast.success(send ? "Invite sent." : "Added to the access list.", { description: result.code ? `Access code: ${result.code}` : undefined });
      router.refresh();
      onClose();
    });
  }

  return (
    <AdminSheet
      title="Invite someone"
      sub="They're added to the access list as a member. The instance key, if you give it, is set when they first sign in."
      onClose={onClose}
      foot={<>
        <span className="wr-small wr-muted">{send ? "We email them the invite." : "Nothing is sent. Share the code yourself."}</span>
        <span className="wr-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="admin-invite" icon={send ? "send" : "plus"} loading={pending}>{send ? "Send invite" : "Add to list"}</Button></span>
      </>}
    >
      <form id="admin-invite" className="wr-stack" onSubmit={submit} onChange={() => setError(null)}>
        <div className="wr-two">
          <label className="wr-field">First name<input name="firstName" type="text" autoComplete="off" required maxLength={60} /></label>
          <label className="wr-field">Last name<input name="lastName" type="text" autoComplete="off" maxLength={60} /></label>
        </div>
        <label className="wr-field">Email<input name="email" type="email" autoComplete="off" placeholder="name@company.com" required /></label>
        {error && <p className="wr-field-error" role="alert">{error}</p>}
      </form>

      <SheetSection title="How they can join" hint="Sign-in is always by an emailed code. This only decides how they create the account.">
        <div className="wr-radio-pills" role="radiogroup" aria-label="How they can join">
          {(Object.keys(HOW) as InviteHow[]).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={how === value} onClick={() => setHow(value)}><span aria-hidden="true" />{HOW[value]}</button>
          ))}
        </div>
        {how !== "email" && (
          <div className="wr-field">
            <span id="invite-expiry">Access code works for</span>
            <div className="wr-radio-pills" role="radiogroup" aria-labelledby="invite-expiry">
              {EXPIRY.map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={expiry === value} onClick={() => setExpiry(value)}><span aria-hidden="true" />{label}</button>
              ))}
            </div>
          </div>
        )}
      </SheetSection>

      <SheetSection title="On joining">
        <ul className="wr-toggles wr-admin-toggles">
          <li><span><strong>Instance key</strong><span className="wr-small wr-muted">Their AI runs on your key, up to the daily cap.</span></span><Switch aria-label="Instance key" checked={instanceKey} onChange={setInstanceKey} /></li>
          <li><span><strong>Email the invite</strong><span className="wr-small wr-muted">With the code and a sign-up link.</span></span><Switch aria-label="Email the invite" checked={send} onChange={setSend} /></li>
        </ul>
      </SheetSection>
    </AdminSheet>
  );
}

export function AccessView({ invites, signupMode, actions }: { invites: AdminInvite[]; signupMode: "open" | "invite_only"; actions: AdminActions }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [inviting, setInviting] = useState(params.get("invite") === "1");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const rows = invites.filter((invite) => filter === "all" || invite.state !== "joined");

  function run(work: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    start(async () => {
      const result = await work();
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message ?? done);
      router.refresh();
    });
  }

  return (
    <>
      <AdminHead page="access" actions={<Button icon="plus" onClick={() => setInviting(true)}>Invite someone</Button>}>
        Who may create an account, and how. Sign-in always needs a code emailed to them.
      </AdminHead>

      <section className="wr-card wr-settings-card">
        <div className="wr-settings-card-head wr-settings-card-row">
          <div>
            <h2 className="wr-h2">Sign-up</h2>
            <p className="wr-sub wr-small">{signupMode === "open" ? "Anyone can create an account. They need their own key or credits for AI." : "Only people on the access list can create an account. Anyone already in keeps signing in."}</p>
          </div>
          <div className="wr-filter" role="group" aria-label="Sign-up">
            {([["open", "Open"], ["invite_only", "Invite only"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={signupMode === value} disabled={pending}
                onClick={() => signupMode !== value && run(() => actions.setSignupMode(value), value === "open" ? "Sign-up is open." : "Sign-up is invite only.")}>{label}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="wr-card wr-table-card">
        <div className="wr-admin-toolbar">
          <h2 className="wr-h2">Access list</h2>
          <div className="wr-filter" role="group" aria-label="Show">
            <button type="button" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Not joined</button>
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Everyone</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="wr-small wr-muted wr-admin-empty-note">{filter === "open" ? "Everyone you invited has joined." : "No one on the list yet."}</p>
        ) : (
          <ul className="wr-admin-list wr-admin-invites" aria-label="Access list">
            <li className="wr-admin-list-head" aria-hidden="true"><span>Person</span><span>Joins with</span><span>Access code</span><span>Status</span><span /></li>
            {rows.map((invite) => (
              <li key={invite.email}>
                <div className="wr-admin-row">
                  <MemberWho member={invite} />
                  <span className="wr-admin-cell-ai">
                    <span className="wr-small">{HOW[invite.how]}</span>
                    {invite.instanceKey && <span className="wr-small wr-muted">Instance key</span>}
                  </span>
                  <span className="wr-admin-cell-usage">
                    {invite.code && invite.state !== "joined" ? (
                      <span className="wr-admin-code">
                        <span className="wr-mono">{invite.code}</span>
                        <span className="wr-small wr-muted">{invite.expires ? `${invite.state === "expired" ? "Expired" : "Until"} ${shortDate(invite.expires)}` : "No expiry"}</span>
                      </span>
                    ) : <span className="wr-small wr-muted">{invite.state === "joined" ? "—" : "No code"}</span>}
                  </span>
                  <span className="wr-admin-cell-status"><span className="wr-tag" data-kind={STATE[invite.state].kind}>{STATE[invite.state].label}</span></span>
                  <span className="wr-admin-row-actions">
                    {invite.code && invite.state === "waiting" && (
                      <button type="button" className="wr-icon-btn" aria-label={`Copy ${invite.name}'s code`} title="Copy code" onClick={() => copy(invite.code!, "Code")}><Icon name="copy" size={16} /></button>
                    )}
                    {invite.state !== "joined" && (invite.state === "expired" || !invite.code) && (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(async () => {
                        const result = await actions.newCode(invite.email);
                        if (result.ok && "code" in result && result.code) await copy(result.code, "New code");
                        return result;
                      }, `New code made for ${invite.name}. It works for 30 days.`)}>New code</Button>
                    )}
                    {invite.state !== "joined" && (
                      <button type="button" className="wr-icon-btn" aria-label={`Remove ${invite.name}`} title="Remove" disabled={pending}
                        onClick={() => window.confirm(`Remove ${invite.name} from the access list? Their code stops working.`) && run(() => actions.removeInvite(invite.email), `${invite.name} removed from the access list.`)}>
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inviting && <InviteSheet actions={actions} onClose={() => setInviting(false)} />}
    </>
  );
}
