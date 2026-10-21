"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { OTP_LENGTH, otpSchema, type OtpValues } from "../../lib/auth/schemas";
import { useCaptcha } from "../turnstile";
import { Button, CodeInput } from "../ui";

const RESEND_AFTER = 60;

type Props = {
  /** Where the code went, as shown to the person: a full address, or a masked one for sign-up. */
  destination: ReactNode;
  submitLabel?: string;
  /** Checks the code. Returns an error message for the field, or null when it was accepted. */
  onVerify: (code: string) => Promise<string | null>;
  /** Sends a new code. Returns true when it was sent; on failure the caller has already said why. */
  onResend: (captchaToken: string | undefined) => Promise<boolean>;
  onBack: () => void;
  backLabel: string;
};

/** Enter the 6-digit code from the email, or request a new one after a short wait. */
export function OtpStep({ destination, submitLabel = "Continue", onVerify, onResend, onBack, backLabel }: Props) {
  const [wait, setWait] = useState(RESEND_AFTER);
  const [sending, setSending] = useState(false);
  const captcha = useCaptcha();
  const { control, handleSubmit, setError, setFocus, reset, formState: { isSubmitting } } = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  useEffect(() => { setFocus("code"); }, [setFocus]);

  async function verify({ code }: OtpValues) {
    try {
      const message = await onVerify(code);
      if (message) setError("code", { message }, { shouldFocus: true });
    } catch {
      toast.error("We couldn't check that code.", { description: "Check your connection and try again." });
    }
  }

  async function resend() {
    setSending(true);
    try {
      if (!(await onResend(captcha.token))) return;
      reset({ code: "" });
      setWait(RESEND_AFTER);
      setFocus("code");
      toast.success("A new code is on its way.", { description: "Codes from earlier emails no longer work." });
    } catch {
      toast.error("We couldn't send a new code.", { description: "Check your connection and try again." });
    } finally {
      captcha.refresh();
      setSending(false);
    }
  }

  return (
    <form className="signin-form" onSubmit={handleSubmit(verify)} noValidate>
      <Controller
        control={control}
        name="code"
        render={({ field, fieldState }) => (
          <CodeInput
            label="6-digit code"
            hint={<>Sent to <strong>{destination}</strong>. Check spam if it isn&apos;t there in a minute.</>}
            error={fieldState.error?.message}
            length={OTP_LENGTH}
            disabled={isSubmitting}
            name={field.name}
            ref={field.ref}
            value={field.value}
            onBlur={field.onBlur}
            onChange={(value) => {
              field.onChange(value);
              // Submit as soon as the last digit lands, including a pasted or autofilled code.
              if (value.length === OTP_LENGTH) void handleSubmit(verify)();
            }}
          />
        )}
      />
      <Button type="submit" size="lg" loading={isSubmitting}>{isSubmitting ? "Checking code" : submitLabel}</Button>
      <div className="signin-resend">
        {wait > 0 ? (
          <span>Didn&apos;t get it? You can send a new code in <span className="signin-timer">0:{String(wait).padStart(2, "0")}</span></span>
        ) : (
          <>
            {captcha.widget}
            <Button type="button" variant="secondary" loading={sending} disabled={!captcha.ready} onClick={resend}>Send a new code</Button>
          </>
        )}
      </div>
      <div className="signin-links">
        <button className="pxt-text-button" type="button" disabled={isSubmitting} onClick={onBack}>{backLabel}</button>
      </div>
    </form>
  );
}
