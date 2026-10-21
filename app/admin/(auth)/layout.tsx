import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthShell } from "../../../components/auth/auth-shell";

export const metadata: Metadata = { title: "Admin · Poxeet", robots: { index: false, follow: false } };

// Admin sign-in and sign-up (D-032): public pages, in the same card as member sign-in, without the site menu.
export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell nav={false}>{children}</AuthShell>;
}
