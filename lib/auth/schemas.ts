import { z } from "zod";

// One place for every auth and onboarding form rule. Forms use these through zodResolver,
// and server actions parse their input with the same schemas.

export const OTP_LENGTH = 6;

/** How a person gets in: their email, or the access code from their invite. Both end with an emailed code. */
export type AccessMethod = "email" | "code";

export const emailField = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address, like you@example.com."))
  .transform((value) => value.toLowerCase());

export const otpField = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code from the email.`);

/** Access codes are stored upper case: letters, digits and dashes, 4 to 32 long. */
export const accessCodeField = z
  .string()
  .trim()
  .min(1, "Enter the access code from your invite.")
  .transform((value) => value.toUpperCase().replace(/\s+/g, ""))
  .pipe(z.string().regex(/^[A-Z0-9-]{4,32}$/, "Access codes are 4 to 32 letters, numbers or dashes."));

export const emailOnlySchema = z.object({ email: emailField });
export const accessCodeSchema = z.object({ accessCode: accessCodeField });
export const otpSchema = z.object({ code: otpField });

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const timezoneStepSchema = z.object({ timezone: z.string().min(1, "Pick your time zone.") });

export const rhythmStepSchema = z.object({
  days: z.array(z.enum(WEEKDAYS)).min(1, "Pick at least one day.").max(7),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time."),
});

export type EmailOnlyValues = z.input<typeof emailOnlySchema>;
export type AccessCodeValues = z.input<typeof accessCodeSchema>;
export type OtpValues = z.input<typeof otpSchema>;
export type TimezoneStepValues = z.input<typeof timezoneStepSchema>;
export type RhythmStepValues = z.input<typeof rhythmStepSchema>;

const SAME_SITE = "http://poxeet.invalid";

/**
 * Only same-site paths are allowed as a post-sign-in destination. Browsers drop tabs and newlines from URLs and
 * read "\" as "/", so "/\t/evil.com" would become "//evil.com": those characters are refused outright, and the
 * path must still resolve to this site.
 */
export function safeNext(next: string | null | undefined, fallback = "/app") {
  if (!next || !next.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const url = new URL(next, SAME_SITE);
    return url.origin === SAME_SITE ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** st•••@gmail.com: enough to recognise your own address, not enough to learn someone else's. */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}•••@${domain}`;
}
