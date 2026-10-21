import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderEmail } from "../../../lib/email/layout";
import { email, templates, type TemplateName } from "../../../lib/email";
import { SAMPLES } from "../../../lib/email/samples";
import { confirmSignup, signInCode } from "../../../lib/email/templates/auth";

export const metadata: Metadata = { title: "Emails · Poxeet", robots: { index: false, follow: false } };

// Every email with sample data, as recipients will see it. Development only: production builds answer 404.
export default function EmailPreviews() {
  if (process.env.NODE_ENV === "production") notFound();
  const recipient = "stephen@example.com";
  const sendable = (Object.keys(templates) as TemplateName[]).map((name) => ({
    name, note: "Sent with email.sendSingle / sendBulk", rendered: email.render(name, SAMPLES[name] as never, recipient),
  }));
  const auth = [
    { name: "confirmSignup", note: "Sent by Supabase (Confirm signup)", rendered: renderEmail(confirmSignup({ code: "482917" }), recipient) },
    { name: "signInCode", note: "Sent by Supabase (Magic Link)", rendered: renderEmail(signInCode({ code: "482917" }), recipient) },
  ];

  return (
    <main className="dev-emails">
      <header>
        <h1 className="type-heading-lg">Emails</h1>
        <p>Every template in the shared layout, with sample data. Send one for real with <code>pnpm email:test you@example.com invite</code>.</p>
      </header>
      {[...sendable, ...auth].map(({ name, note, rendered }) => (
        <section key={name} aria-labelledby={`email-${name}`}>
          <div className="dev-emails-meta">
            <h2 id={`email-${name}`}>{name}</h2>
            <span>{note}</span>
            <strong>{rendered.subject}</strong>
          </div>
          <iframe title={`${name} email`} srcDoc={rendered.html} sandbox="" />
        </section>
      ))}
    </main>
  );
}
