import { NextResponse, type NextRequest } from "next/server";
import { billingEnabled } from "../../../../lib/billing/config";
import { cronAuthorized } from "../../../../lib/cron";
import { sendEmptyWeekEmails, sendExpiryEmails, sendWeeklySummaries } from "../../../../lib/digest";
import { createAdminClient, getSecretKey } from "../../../../lib/supabase/admin";

// The daily job (PRD section 12): marks posts more than 24 hours late as missed, flags sends that never finished,
// releases credit holds left open by crashed AI jobs, emails members whose LinkedIn access ends in 7 or 1 days, and
// (from Thursday) members whose next week has nothing approved, and (on Monday) sends the weekly summary to members
// who asked for it. The emails live in lib/digest.ts and respect each member's notification settings.
//   POST /api/cron/daily  with  Authorization: Bearer <CRON_SECRET>, once a day
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request.headers.get("authorization"))) return new NextResponse("Unauthorized", { status: 401 });
  if (!getSecretKey()) return new NextResponse("Not configured", { status: 503 });
  const admin = createAdminClient();
  try {
    const [{ data: missed }, { data: stuck }, holds] = await Promise.all([
      admin.rpc("mark_missed_posts"),
      admin.rpc("release_stuck_posts"),
      billingEnabled() ? admin.rpc("release_stale_holds", {}) : Promise.resolve({ data: 0 }),
    ]);
    const expiryEmails = await sendExpiryEmails();
    const emptyWeekEmails = await sendEmptyWeekEmails();
    const weeklySummaries = await sendWeeklySummaries();
    return NextResponse.json({
      ok: true, missed: Number(missed ?? 0), stuck: Number(stuck ?? 0), holdsReleased: Number(holds.data ?? 0), expiryEmails, emptyWeekEmails, weeklySummaries,
    });
  } catch (error) {
    console.error("[daily] Run failed:", error);
    // Only callers with the secret see this, so the reason is safe to return (never post text or tokens).
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
