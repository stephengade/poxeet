import { OverviewView } from "../../../components/admin/overview-view";
import { loadOverview, requireAdmin } from "../../../lib/admin/server";

export const instant = false;

export default async function AdminOverviewPage() {
  const actor = await requireAdmin();
  const data = await loadOverview();
  return <OverviewView data={data} base="/admin" timeZone={actor.timezone} />;
}
