import { AdminsView } from "../../../../components/admin/admins-view";
import { loadAdmins, requestTime, requireAdmin } from "../../../../lib/admin/server";
import { appUrl } from "../../../../lib/config";
import { adminActions } from "../admin-actions";

export const instant = false;

export default async function AdminAdminsPage() {
  const actor = await requireAdmin();
  const admins = await loadAdmins(actor);
  return <AdminsView admins={admins} actions={adminActions} timeZone={actor.timezone} now={requestTime()} signupUrl={`${appUrl()}/admin/signup`} />;
}
