import { codePanel, heading, paragraph, type EmailContent } from "../layout";

// Supabase Auth sends these itself. scripts/email-supabase-templates.ts renders them with Supabase's
// placeholders ({{ .Token }}, {{ .Email }}) into supabase/templates/, to paste into the dashboard.

export type AuthCodeData = { code: string };

/** First code for a new account (Supabase's "Confirm signup" template). */
export function confirmSignup({ code }: AuthCodeData): EmailContent {
  return {
    subject: "Your Poxeet confirmation code",
    preheader: "Enter this code to finish creating your account.",
    body: [
      heading("Confirm your email"),
      paragraph(["Enter this code in ", { accent: "Poxeet" }, " to finish creating your account."]),
      codePanel({ code, label: "Your 6-digit code", note: "It works once and expires in an hour." }),
      paragraph("If you didn't try to create an account, ignore this email."),
    ],
  };
}

/** Sign-in code (Supabase's "Magic Link" template). */
export function signInCode({ code }: AuthCodeData): EmailContent {
  return {
    subject: "Your Poxeet sign-in code",
    preheader: "Enter this code to sign in.",
    body: [
      heading("Your sign-in code"),
      paragraph(["Enter this code in ", { accent: "Poxeet" }, " to sign in."]),
      codePanel({ code, label: "Your 6-digit code", note: "It works once and expires in an hour." }),
      paragraph("If you didn't try to sign in, ignore this email. Your account is safe."),
    ],
  };
}
