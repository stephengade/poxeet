import { redirect } from "next/navigation";
import { AdminAccess } from "../../../components/admin/admin-access";
import { adminSecret } from "../../../lib/admin/code";
import { adminAccount, getAdminActor } from "../../../lib/admin/session";
import { getSecretKey } from "../../../lib/supabase/admin";

/** Where the admin sign-in starts: the dashboard if already in, the access-code step if the email is verified. */
export async function AdminGate({ mode }: { mode: "signin" | "signup" }) {
  if (await getAdminActor()) redirect("/admin");
  const account = await adminAccount();
  const start = account?.admin ? { mustChange: account.admin.must_change_code } : null;
  return <AdminAccess mode={mode} start={start} notReady={!getSecretKey() || !adminSecret()} />;
}
