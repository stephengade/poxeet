export const APP_NAME = "Poxeet";

// The public source repository, linked from the landing page's GitHub buttons.
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || null;

/** Where members write about their data or account (the Privacy page): CONTACT_EMAIL, else EMAIL_FROM, else none. */
export function contactEmail() {
  return process.env.CONTACT_EMAIL?.trim() || process.env.EMAIL_FROM?.trim() || null;
}

// The public address of this instance, for links in emails. No trailing slash.
export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
