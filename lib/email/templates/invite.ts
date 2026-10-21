import { appUrl } from "../../config";
import { actionPanel, codePanel, heading, linkFallback, paragraph, type EmailContent } from "../layout";

export type InviteData = {
  firstName?: string | null;
  /** How they may create their account; mirrors allowlist.access_type. */
  accessType: "code" | "email" | "all";
  accessCode?: string | null;
  codeExpiresAt?: Date | string | null;
  email: string;
};

const formatDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Sent when the operator invites someone: their access code (if any) and where to create the account. */
export function invite(data: InviteData): EmailContent {
  const usesCode = data.accessType !== "email" && data.accessCode;
  const url = usesCode
    ? `${appUrl()}/signup?code=${encodeURIComponent(data.accessCode!)}`
    : `${appUrl()}/signup?email=${encodeURIComponent(data.email)}`;
  const expiry = usesCode && data.codeExpiresAt ? `Works until ${formatDate(data.codeExpiresAt)}.` : undefined;

  return {
    subject: "You're invited to Poxeet",
    preheader: "Create your account and plan a month of LinkedIn posts in your voice.",
    body: [
      heading(data.firstName ? `You're invited, ${data.firstName}` : "You're invited"),
      paragraph(["You've been given access to ", { accent: "Poxeet" }, ". It drafts a month of LinkedIn posts in your own voice, and nothing goes out until you approve it."]),
      ...(usesCode
        ? [
          codePanel({ code: data.accessCode!, label: "Your access code", note: expiry }),
          paragraph("Use the button below, or enter the code on the sign-up page. We'll email you a 6-digit code to finish."),
        ]
        : [paragraph(["Create your account with this email address, ", { strong: data.email }, ". We'll send you a 6-digit code to finish."])]),
      actionPanel({ title: "Create your account", note: "It takes about a minute", label: "Get started", href: url }),
    ],
    footer: [linkFallback(url)],
  };
}
