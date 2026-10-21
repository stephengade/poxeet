// The one email frame: header wordmark, body blocks, footer. Every email Poxeet sends is built from these,
// so they look the same and nobody writes table markup by hand. Based on supabase/templates/reset-password.html,
// in the app's colours. Every string passed in is escaped; only the builders below produce markup.

const C = {
  ink: "#0a0a0a",
  body: "#52525b",
  muted: "#71717a",
  brand: "#2e4be0",
  panel: "#fafafa",
  panelLine: "#e7e7ea",
  rule: "#ececef",
};
const FONT = "'Geist','Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

/** One piece of an email, as HTML and as plain text. */
export type Block = { html: string; text: string };

/** Inline text: plain, the brand accent, bold, or a link. */
export type Inline = string | { accent: string } | { strong: string } | { href: string; label: string };

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inlineHtml(parts: Inline | Inline[]) {
  return (Array.isArray(parts) ? parts : [parts]).map((part) => {
    if (typeof part === "string") return escapeHtml(part);
    if ("accent" in part) return `<span style="color:${C.brand};">${escapeHtml(part.accent)}</span>`;
    if ("strong" in part) return `<strong style="font-weight:600;color:${C.ink};">${escapeHtml(part.strong)}</strong>`;
    return `<a href="${escapeHtml(part.href)}" style="color:${C.brand};text-decoration:underline;">${escapeHtml(part.label)}</a>`;
  }).join("");
}

function inlineText(parts: Inline | Inline[]) {
  return (Array.isArray(parts) ? parts : [parts]).map((part) => {
    if (typeof part === "string") return part;
    if ("accent" in part) return part.accent;
    if ("strong" in part) return part.strong;
    return `${part.label} (${part.href})`;
  }).join("");
}

const row = (style: string, inner: string) => `<tr><td align="left" style="${style}">${inner}</td></tr>`;

/* ---------- Building blocks ---------- */

export function heading(text: string): Block {
  return {
    html: row(`padding:0 0 20px;font-size:32px;line-height:40px;font-weight:500;letter-spacing:-0.035em;color:${C.ink};`, escapeHtml(text)),
    text: `${text}\n${"=".repeat(Math.min(text.length, 60))}`,
  };
}

export function paragraph(parts: Inline | Inline[]): Block {
  return {
    html: row(`padding:0 0 20px;font-size:16px;line-height:26px;color:${C.body};`, inlineHtml(parts)),
    text: inlineText(parts),
  };
}

export function muted(parts: Inline | Inline[]): Block {
  return {
    html: row(`padding:0 0 20px;font-size:13px;line-height:21px;color:${C.muted};`, inlineHtml(parts)),
    text: inlineText(parts),
  };
}

function panel(inner: string) {
  return row("padding:12px 0 32px;", `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${C.panelLine};border-radius:10px;border-collapse:separate;"><tr><td style="padding:20px 24px;">${inner}</td></tr></table>`);
}

function button(label: string, href: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="${C.brand}" style="background:${C.brand};border-radius:6px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 18px;font-size:12px;line-height:16px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

/** The grey panel: a title and short note on the left, one button on the right. */
export function actionPanel({ title, note, label, href }: { title: string; note?: string; label: string; href: string }): Block {
  const left = `${escapeHtml(title)}${note ? `<br /><span style="font-size:13px;line-height:20px;color:${C.muted};">${escapeHtml(note)}</span>` : ""}`;
  return {
    html: panel(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td align="left" valign="middle" style="font-size:15px;line-height:22px;color:${C.ink};">${left}</td>
      <td align="right" valign="middle" width="1" style="padding-left:16px;white-space:nowrap;">${button(label, href)}</td>
    </tr></table>`),
    text: `${title}${note ? `\n${note}` : ""}\n${label}: ${href}`,
  };
}

/** A small line in the footer. */
export function footnote(parts: Inline | Inline[]): Block {
  return {
    html: row(`padding:16px 0 0;font-size:13px;line-height:21px;color:${C.muted};`, inlineHtml(parts)),
    text: inlineText(parts),
  };
}

/** A code to type or copy: a 6-digit sign-in code or an access code. */
export function codePanel({ code, label, note }: { code: string; label: string; note?: string }): Block {
  return {
    html: panel(`<span style="display:block;font-size:13px;line-height:20px;color:${C.muted};">${escapeHtml(label)}</span>
      <span style="display:block;padding:8px 0 0;font-family:${MONO};font-size:30px;line-height:38px;font-weight:500;letter-spacing:0.18em;color:${C.ink};">${escapeHtml(code)}</span>
      ${note ? `<span style="display:block;padding:8px 0 0;font-size:13px;line-height:20px;color:${C.muted};">${escapeHtml(note)}</span>` : ""}`),
    text: `${label}: ${code}${note ? `\n${note}` : ""}`,
  };
}

/** For the footer: the raw link, for when a button doesn't work. */
export function linkFallback(href: string): Block {
  return {
    html: row(`padding:16px 0 0;font-size:13px;line-height:21px;color:${C.muted};`, `Button not working? Paste this link into your browser:<br /><a href="${escapeHtml(href)}" style="color:${C.muted};text-decoration:underline;word-break:break-all;">${escapeHtml(href)}</a>`),
    text: `Button not working? Paste this link into your browser: ${href}`,
  };
}

/* ---------- The frame ---------- */

export type EmailContent = {
  subject: string;
  /** The grey line inbox lists show after the subject. */
  preheader: string;
  body: Block[];
  /** Extra footer lines (linkFallback, footnote), such as how to turn a notification off. */
  footer?: Block[];
};

export type RenderedEmail = { subject: string; html: string; text: string };

const wordmark = (size: number, padding: string) =>
  row(`padding:${padding};font-size:${size}px;line-height:${size + 6}px;font-weight:500;letter-spacing:-0.04em;color:${C.ink};`, `poxeet<span style="color:${C.brand};">.</span>`);

/** Wraps the content in the header and footer. `recipient` is named in the footer. */
export function renderEmail(content: EmailContent, recipient: string): RenderedEmail {
  const footer = [
    ...(content.footer ?? []),
    footnote(`Poxeet sent this email to ${recipient}. We'll never ask for your password or codes over email, chat or phone.`),
  ];
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(content.subject)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@500&display=swap" rel="stylesheet" />
    <style>body, td, a, span { font-family: ${FONT}; }</style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:${FONT};font-weight:400;color:${C.ink};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="background:#ffffff;">
      <tr><td align="center" style="padding:40px 24px 56px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
          ${wordmark(22, "0 0 56px")}
          ${content.body.map((block) => block.html).join("\n          ")}
          <tr><td style="padding:40px 0 0;"><div style="border-top:1px solid ${C.rule};height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
          ${wordmark(16, "32px 0 0")}
          ${footer.map((block) => block.html).join("\n          ")}
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = [...content.body.map((block) => block.text), "--", "poxeet", ...footer.map((block) => block.text)].join("\n\n");
  return { subject: content.subject, html, text };
}
