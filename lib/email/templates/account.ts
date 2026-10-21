import { appUrl } from "../../config";
import { actionPanel, footnote, heading, linkFallback, paragraph, type EmailContent } from "../layout";

// Security notices about the member's own account. They are always sent (no opt-out), because they are how a
// member notices a change they didn't make.

const formatDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const notYou = () => footnote([
  "Didn't do this? Disconnect LinkedIn in ",
  { href: `${appUrl()}/app/settings/channels`, label: "Settings" },
  " right away. Nothing is posted without your approval.",
]);

export type LinkedInConnectedData = {
  firstName?: string | null;
  /** The LinkedIn profile's name, as LinkedIn reported it. */
  linkedinName?: string | null;
  expiresAt: Date | string;
  /** True when this replaced an earlier connection. */
  reconnected?: boolean;
};

export function linkedinConnected(data: LinkedInConnectedData): EmailContent {
  const url = `${appUrl()}/app/settings/channels`;
  const verb = data.reconnected ? "reconnected" : "connected";
  return {
    subject: `LinkedIn ${verb} to Poxeet`,
    preheader: `Poxeet can publish the posts you approve${data.linkedinName ? ` to ${data.linkedinName}'s profile` : ""}.`,
    body: [
      heading(`LinkedIn is ${verb}`),
      paragraph([
        data.firstName ? `Hi ${data.firstName}, ` : "",
        "Poxeet can now publish the posts you approve",
        data.linkedinName ? [" to ", { strong: data.linkedinName }, "'s profile"] : " to your profile",
        ". Nothing goes out until you approve it, and Poxeet never reads your feed or messages.",
      ].flat()),
      paragraph(["LinkedIn access lasts until ", { strong: formatDate(data.expiresAt) }, ". We'll email you a week before so you can reconnect."]),
      actionPanel({ title: "Your connection", note: "See it, or disconnect, in Settings", label: "Open settings", href: url }),
    ],
    footer: [linkFallback(url), notYou()],
  };
}

export type LinkedInDisconnectedData = { firstName?: string | null; linkedinName?: string | null };

export function linkedinDisconnected(data: LinkedInDisconnectedData): EmailContent {
  const url = `${appUrl()}/app/settings/channels`;
  return {
    subject: "LinkedIn disconnected from Poxeet",
    preheader: "Nothing will be posted until you connect LinkedIn again.",
    body: [
      heading("LinkedIn is disconnected"),
      paragraph([
        data.firstName ? `Hi ${data.firstName}, ` : "",
        data.linkedinName ? ["Poxeet is no longer connected to ", { strong: data.linkedinName }, "'s LinkedIn profile, and its access was revoked."] : "Poxeet is no longer connected to your LinkedIn profile, and its access was revoked.",
      ].flat()),
      paragraph("Nothing will be posted until you connect again. Approved posts stay approved and wait for you."),
      actionPanel({ title: "Connect again", note: "Takes a few seconds", label: "Reconnect", href: url }),
    ],
    footer: [linkFallback(url), footnote("Didn't do this? Sign in and reconnect, then check Settings for anything you don't recognise.")],
  };
}
