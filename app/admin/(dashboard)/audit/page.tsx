import { AuditView } from "../../../../components/admin/audit-view";
import { loadAudit, requestTime, requireAdmin } from "../../../../lib/admin/server";

export const instant = false;

export default async function AdminAuditPage() {
  const actor = await requireAdmin();
  return <AuditView entries={await loadAudit(200)} timeZone={actor.timezone} now={requestTime()} />;
}
