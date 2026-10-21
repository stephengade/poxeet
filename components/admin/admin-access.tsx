"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { requestAdminCode, verifyAdminEmailCode, enterAccessCode } from "../../app/admin/(auth)/actions";
import { CODE_MIN, codeProblem } from "../../lib/admin/code-rules";
import { AuthHeading } from "../auth/auth-shell";
import { OtpStep } from "../auth/otp-step";
import { useCaptcha } from "../turnstile";
import { Banner, Button, Input } from "../ui";

// Admin sign-in and sign-up (D-032): email, the emailed 6-digit code, then the access code. An admin still on a
// starting code (a new invite or a reset) chooses their own in the last step.

type Mode = "signin" | "signup";
type Step = { name: "email" } | { name: "otp"; email: string } | { name: "code"; mustChange: boolean };

const COPY: Record<Mode, { title: string; accent: string; sub: string; other: { text: string; link: string; href: string } }> = {
  signin: {
    title: "Admin", accent: "sign in", sub: "For the people who run this instance. Members sign in on the main page.",
    other: { text: "Invited as an admin?", link: "Set up your account", href: "/admin/signup" },
  },
  signup: {
    title: "Admin", accent: "sign-up", sub: "You were invited to run this instance. Use the email and starting code you were given.",
    other: { text: "Already set up?", link: "Sign in", href: "/admin/login" },
  },
};

function EmailStep({ mode, notReady, onSent }: { mode: Mode; notReady: boolean; onSent: (email: string) => void }) {
  const captcha = useCaptcha();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await requestAdminCode({ mode, email, captchaToken: captcha.token });
      if (!result.ok) return setError(result.message);
      onSent(email.trim().toLowerCase());
    } finally {
      captcha.refresh();
      setBusy(false);
    }
  }

  return (
    <form className="signin-form" onSubmit={submit} noValidate>
      {notReady && <Banner tone="warning" title="Not set up yet">The admin area needs SUPABASE_SECRET_KEY and ADMIN_SECRET on the server.</Banner>}
      <Input label="Admin email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} error={error ?? undefined} required />
      {captcha.widget}
      <Button type="submit" size="lg" loading={busy} disabled={!captcha.ready || notReady}>Email me a code</Button>
    </form>
  );
}

function AccessCodeStep({ mustChange, onDone }: { mustChange: boolean; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<{ access?: string; next?: string; general?: string }>({});
  const [busy, setBusy] = useState(false);
  const digits = (value: string) => value.replace(/\D/g, "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mustChange) {
      const problem = codeProblem(next) ?? (next !== again ? "The two new codes don't match." : null);
      if (problem) return setErrors({ next: problem });
    }
    setBusy(true);
    try {
      const result = await enterAccessCode({ code, newCode: mustChange ? next : undefined });
      if (!result.ok) return setErrors(result.field === "access" ? { access: result.message } : result.field === "next" ? { next: result.message } : { general: result.message });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="signin-form" onSubmit={submit} noValidate>
      {errors.general && <Banner tone="critical" title="Couldn't sign in">{errors.general}</Banner>}
      <Input label={mustChange ? "Starting access code" : "Access code"} type="password" inputMode="numeric" autoComplete={mustChange ? "off" : "current-password"}
        hint={mustChange ? "The code you were given with your invite or reset." : "Your admin access code. Five wrong tries locks it for 15 minutes."}
        value={code} onChange={(event) => { setCode(digits(event.target.value)); setErrors({}); }} error={errors.access} autoFocus required />
      {mustChange && (
        <>
          <Input label="Choose your own code" type="password" inputMode="numeric" autoComplete="new-password" hint={`Digits only, at least ${CODE_MIN}. Only you will know it.`}
            value={next} onChange={(event) => { setNext(digits(event.target.value)); setErrors({}); }} error={errors.next} required />
          <Input label="Type it again" type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(event) => { setAgain(digits(event.target.value)); setErrors({}); }} required />
        </>
      )}
      <Button type="submit" size="lg" loading={busy} disabled={!code || (mustChange && (!next || !again))}>{mustChange ? "Save code and open dashboard" : "Open dashboard"}</Button>
      <p className="signin-note">Forgot it? Another admin can reset it for you.</p>
    </form>
  );
}

export function AdminAccess({ mode, start, notReady = false }: { mode: Mode; start?: { mustChange: boolean } | null; notReady?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(start ? { name: "code", mustChange: start.mustChange } : { name: "email" });
  const copy = COPY[mode];
  const sub = step.name === "code"
    ? step.mustChange ? "Enter the starting code you were given, then choose your own." : "One more step: your admin access code."
    : copy.sub;

  return (
    <>
      <AuthHeading title={copy.title} accent={copy.accent}>{sub}</AuthHeading>
      {step.name === "email" && <EmailStep mode={mode} notReady={notReady} onSent={(email) => setStep({ name: "otp", email })} />}
      {step.name === "otp" && (
        <OtpStep
          destination={step.email}
          onVerify={async (code) => {
            const result = await verifyAdminEmailCode({ email: step.email, code });
            if (!result.ok) return result.message;
            setStep({ name: "code", mustChange: result.mustChange === true });
            return null;
          }}
          onResend={async (captchaToken) => (await requestAdminCode({ mode, email: step.email, captchaToken })).ok}
          onBack={() => setStep({ name: "email" })}
          backLabel="Use a different email"
        />
      )}
      {step.name === "code" && <AccessCodeStep mustChange={step.mustChange} onDone={() => { router.replace("/admin"); router.refresh(); }} />}
      {step.name === "email" && (
        <p className="signin-note">{copy.other.text} <Link href={copy.other.href} className="pxt-link">{copy.other.link}</Link></p>
      )}
      {step.name === "otp" && <p className="signin-note">If this email is an admin {mode === "signup" ? "invite" : "account"}, a code is on its way. Nothing arrives for other addresses.</p>}
    </>
  );
}
