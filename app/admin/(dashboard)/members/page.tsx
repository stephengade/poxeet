import { MembersView } from "../../../../components/admin/members-view";
import { billingEnabled } from "../../../../lib/billing/config";
import { loadAudit, loadMembers, requestTime, requireAdmin } from "../../../../lib/admin/server";
import { adminActions } from "../admin-actions";

export const instant = false;

export default async function AdminMembersPage() {
  const actor = await requireAdmin();
  const [members, audit] = await Promise.all([loadMembers(), loadAudit()]);
  return <MembersView members={members} audit={audit} billing={billingEnabled()} timeZone={actor.timezone} now={requestTime()} actions={adminActions} />;
}
