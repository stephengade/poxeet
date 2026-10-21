import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { AdminFrame } from "../../../components/admin/admin-frame";
import { billingEnabled } from "../../../lib/billing/config";
import { requireAdmin } from "../../../lib/admin/server";
import "../../../components/workroom/workroom.css";

// Checked per request (session, admins table, access code), so it can't be prerendered: navigation blocks on the
// server instead of being validated as instant (D-032).
export const instant = false;

export const metadata: Metadata = { title: "Admin · Poxeet", robots: { index: false, follow: false } };

// The operator's pages (PRD ADM-1, D-031, D-032), in a frame of their own. requireAdmin checks the Supabase session,
// the admins table and the access-code session; signed out goes to /admin/login, anyone else gets a 404. Each page
// and action checks again.
async function Admin({ children }: { children: ReactNode }) {
  const actor = await requireAdmin();
  return <AdminFrame base="/admin" me={{ name: actor.name, email: actor.email }} billing={billingEnabled()} signOut="/admin/signout">{children}</AdminFrame>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="wr-shell"><div className="wr-loading" aria-busy="true" /></div>}>
      <Admin>{children}</Admin>
    </Suspense>
  );
}
