import { AccessView } from "../../../../components/admin/access-view";
import { loadAccess, requireAdmin } from "../../../../lib/admin/server";
import { adminActions } from "../admin-actions";

export const instant = false;

export default async function AdminAccessPage() {
  await requireAdmin();
  const { invites, signupMode } = await loadAccess();
  return <AccessView invites={invites} signupMode={signupMode} actions={adminActions} />;
}
