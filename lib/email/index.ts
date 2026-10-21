// Poxeet's email API. Server only.
//
//   await email.sendSingle({ to: { email, name }, template: "invite", data: { ... } });
//   await email.sendBulk({ template: "emptyNextWeek", recipients: [{ to, data }, ...] });
//
// A template turns typed data into content; renderEmail wraps it in the shared header and footer;
// lib/email/zoho.ts sends it. Neither function throws: check `ok` on the result.

import { renderEmail, type EmailContent, type RenderedEmail } from "./layout";
import { linkedinConnected, linkedinDisconnected } from "./templates/account";
import { creditsLow, creditsReceipt } from "./templates/billing";
import { invite } from "./templates/invite";
import { draftsReady, emptyNextWeek, linkedinExpiring, postFailed, weeklySummary } from "./templates/notifications";
import { sendViaZoho, type Address, type SendResult } from "./zoho";

export type { Address, SendResult } from "./zoho";

/** Every email the app sends. Add a template here to make it sendable. */
export const templates = { invite, linkedinConnected, linkedinDisconnected, linkedinExpiring, emptyNextWeek, creditsReceipt, creditsLow, postFailed, draftsReady, weeklySummary } satisfies Record<string, (data: never) => EmailContent>;

export type TemplateName = keyof typeof templates;
export type TemplateData<N extends TemplateName> = Parameters<(typeof templates)[N]>[0];

type Recipient = Address | string;

type TemplateMessage<N extends TemplateName> = { to: Recipient; template: N; data: TemplateData<N>; replyTo?: Address; reference?: string };
type RawMessage = { to: Recipient; subject: string; html: string; text?: string; replyTo?: Address; reference?: string };

const BULK_CONCURRENCY = 4;

function address(recipient: Recipient): Address {
  return typeof recipient === "string" ? { email: recipient } : recipient;
}

function sender(): Address {
  return { email: process.env.EMAIL_FROM || "poxeet@klosapoint.com", name: process.env.EMAIL_FROM_NAME || "Poxeet" };
}

function replyTo(given?: Address): Address | undefined {
  return given ?? (process.env.EMAIL_REPLY_TO ? { email: process.env.EMAIL_REPLY_TO } : undefined);
}

/** Renders a template for one recipient, without sending. Used by previews and tests. */
export function render<N extends TemplateName>(template: N, data: TemplateData<N>, recipient: string): RenderedEmail {
  const build = templates[template] as (input: TemplateData<N>) => EmailContent;
  return renderEmail(build(data), recipient);
}

async function sendSingle<N extends TemplateName>(message: TemplateMessage<N> | RawMessage): Promise<SendResult> {
  const to = address(message.to);
  const content = "template" in message ? render(message.template, message.data, to.email) : message;
  return sendViaZoho({
    from: sender(),
    to,
    replyTo: replyTo(message.replyTo),
    subject: content.subject,
    html: content.html,
    text: content.text,
    reference: message.reference,
  });
}

export type BulkResult = { sent: number; failed: number; results: Array<{ to: string } & SendResult> };

/**
 * One personalised email per recipient, a few at a time. Each person sees only their own address, and one
 * failure doesn't stop the rest. (Zoho's batch endpoint only does plain {{merge}} substitution without escaping,
 * so each email is rendered here instead.)
 */
async function sendBulk<N extends TemplateName>({ template, recipients }: {
  template: N;
  recipients: Array<{ to: Recipient; data: TemplateData<N>; reference?: string }>;
}): Promise<BulkResult> {
  const results: BulkResult["results"] = new Array(recipients.length);
  let next = 0;
  async function worker() {
    while (next < recipients.length) {
      const index = next++;
      const { to, data, reference } = recipients[index];
      results[index] = { to: address(to).email, ...(await sendSingle({ to, template, data, reference })) };
    }
  }
  await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, recipients.length) }, worker));
  const sent = results.filter((result) => result.ok).length;
  return { sent, failed: results.length - sent, results };
}

export const email = { sendSingle, sendBulk, render };
