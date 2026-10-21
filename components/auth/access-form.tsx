"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  accessCodeSchema, emailOnlySchema, safeNext,
  type AccessCodeValues, type AccessMethod, type EmailOnlyValues,
} from "../../lib/auth/schemas";
import { requestCode, verifyCode, type RequestCodeResult } from "../../app/auth/actions";
import { useCaptcha } from "../turnstile";
import { Banner, Button, Input, Tabs } from "../ui";
import { AuthHeading } from "./auth-shell";
import { OtpStep } from "./otp-step";

type Intent = "signin" | "signup";
type Sent = { method: AccessMethod; value: string; destination: string; firstName: string | null };

type Props = {
  intent: Intent;
  defaultMethod?: AccessMethod;
  email?: string;
  code?: string;
  next?: string;
  suspended?: boolean;
  setupMissing?: boolean;
};

// The server threw (database or network trouble); the server log has the details.
const SERVER_ERROR = "Something went wrong on our side. Try again in a minute.";
const SUSPENDED = () => toast.error("This account is suspended.", { description: "Contact the operator of this instance." });

const COPY = {
  signin: {
    title: "Welcome", accent: "back.",
    lede: "Sign in with your email. We'll send you a 6-digit code, no password needed.",
    submit: "Email me a code", verify: "Sign in",
    foot: { text: "New here and invited?", link: "Create your account", href: "/signup" },
  },
  signup: {
    title: "Join", accent: "Poxeet.",
    lede: "Poxeet is invite-only. Use the access code from your invite, or the email address you were invited with.",
    submit: "Continue", verify: "Create my account",
    foot: { text: "Already have an account?", link: "Sign in", href: "/login" },
  },
} as const;

/**
 * Sign-in and sign-up share one flow: enter an email (or, for sign-up, an access code), get a 6-digit code, verify.
 * Sign-in is email only; access codes are for creating an account.
 */
export function AccessForm({ intent, defaultMethod = "email", email = "", code = "", next, suspended = false, setupMissing = false }: Props) {
  const router = useRouter();
  const copy = COPY[intent];
  const [method, setMethod] = useState<AccessMethod>(intent === "signin" ? "email" : defaultMethod);
  const [sent, setSent] = useState<Sent | null>(null);
  const captcha = useCaptcha();
  const emailForm = useForm<EmailOnlyValues>({ resolver: zodResolver(emailOnlySchema), defaultValues: { email } });
  const codeForm = useForm<AccessCodeValues>({ resolver: zodResolver(accessCodeSchema), defaultValues: { accessCode: code } });

  useEffect(() => { if (suspended) SUSPENDED(); }, [suspended]);

  function switchTo(target: AccessMethod) {
    setMethod(target);
    emailForm.clearErrors();
    codeForm.clearErrors();
  }

  /** Says what happened for every outcome except "sent". Returns false when nothing was sent. */
  function handle(result: RequestCodeResult, used: AccessMethod): result is Extract<RequestCodeResult, { status: "sent" }> {
    switch (result.status) {
      case "sent":
        return true;
      case "field_error":
        if (used === "code") codeForm.setError("accessCode", { message: result.message }, { shouldFocus: true });
        else emailForm.setError("email", { message: result.message }, { shouldFocus: true });
        return false;
      case "unavailable":
        // Deliberately vague: the same words whether the email is unknown, not invited or already registered.
        toast.error(intent === "signin" ? "We couldn't sign you in with that email." : "We couldn't continue with that email.", {
          description: intent === "signin" ? "Check the address and try again." : "Check the address, or use your access code.",
        });
        return false;
      case "use_email":
        toast.info("Use your email to create your account.", { description: "Your invite is set up for email." });
        switchTo("email");
        return false;
      case "already_registered":
        toast.info("You already have an account.", {
          description: `Sign in with ${result.maskedEmail}.`,
          action: { label: "Sign in", onClick: () => router.push("/login") },
        });
        return false;
      default:
        toast.error(result.message);
        return false;
    }
  }

  async function submit(used: AccessMethod, value: string) {
    try {
      const result = await requestCode({ intent, method: used, value, captchaToken: captcha.token });
      if (!handle(result, used)) return;
      setSent({ method: used, value, destination: result.destination, firstName: result.firstName });
      toast.success("Code sent.", { description: `Check ${result.destination} for a 6-digit code.` });
    } catch {
      toast.error(SERVER_ERROR);
    } finally {
      captcha.refresh();
    }
  }

  if (sent) {
    const greeting = intent === "signup" && sent.firstName;
    return (
      <>
        <AuthHeading title={greeting ? `Hi ${sent.firstName},` : "Check your"} accent={greeting ? "check your inbox." : "inbox."}>
          {intent === "signup" ? "Enter the 6-digit code we emailed you to create your account." : "Enter the 6-digit code we emailed you to sign in."}
        </AuthHeading>
        <OtpStep
          destination={sent.destination}
          submitLabel={copy.verify}
          onVerify={async (otp) => {
            const result = await verifyCode({ intent, method: sent.method, value: sent.value, code: otp });
            if (result.status === "ok") {
              if (intent === "signup") toast.success("Your account is ready.");
              // The server action set the session cookie, which already clears the router cache: navigate only.
              router.replace(safeNext(next, result.next));
              return null;
            }
            if (result.status === "wrong_code") return result.message;
            if (result.status === "suspended") { setSent(null); SUSPENDED(); return null; }
            toast.error(result.message);
            return null;
          }}
          onResend={async (captchaToken) => handle(await requestCode({ intent, method: sent.method, value: sent.value, captchaToken }), sent.method)}
          onBack={() => setSent(null)}
          backLabel={sent.method === "code" ? "Use a different access code" : "Use a different email"}
        />
      </>
    );
  }

  const busy = emailForm.formState.isSubmitting || codeForm.formState.isSubmitting;
  const blocked = setupMissing || !captcha.ready;

  return (
    <>
      <AuthHeading title={copy.title} accent={copy.accent}>{copy.lede}</AuthHeading>
      <div className="signin-form">
        {setupMissing && <Banner tone="warning" title="Sign-in isn't set up yet.">Add the Supabase project URL and publishable key to your local environment.</Banner>}
        {intent === "signup" && (
          <Tabs
            aria-label="How to create your account"
            className="signin-tabs"
            value={method}
            onChange={(id) => switchTo(id as AccessMethod)}
            items={[{ id: "code", label: "Access code", icon: "lock" }, { id: "email", label: "Email", icon: "mail" }]}
          />
        )}
        {method === "email" ? (
          <form className="signin-fields" onSubmit={emailForm.handleSubmit(({ email: value }) => submit("email", value))} noValidate>
            <Input
              label="Email address" icon="mail" type="email" autoComplete="email" placeholder="you@example.com" autoFocus
              error={emailForm.formState.errors.email?.message}
              {...emailForm.register("email")}
            />
            {captcha.widget}
            <Button type="submit" size="lg" loading={busy} disabled={blocked}>{busy ? "Sending code" : copy.submit}</Button>
          </form>
        ) : (
          <form className="signin-fields" onSubmit={codeForm.handleSubmit(({ accessCode }) => submit("code", accessCode))} noValidate>
            <Input
              label="Access code" icon="lock" className="signin-access" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              placeholder="e.g. CODE01" maxLength={40} autoFocus
              hint="It's in your invite. Not case-sensitive."
              error={codeForm.formState.errors.accessCode?.message}
              {...codeForm.register("accessCode")}
            />
            {captcha.widget}
            <Button type="submit" size="lg" loading={busy} disabled={blocked}>{busy ? "Checking code" : copy.submit}</Button>
          </form>
        )}
      </div>
      <p className="signin-foot">{copy.foot.text} <Link href={copy.foot.href}>{copy.foot.link}</Link></p>
    </>
  );
}
