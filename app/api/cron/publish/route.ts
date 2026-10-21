import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "../../../../lib/cron";
import { publishDue } from "../../../../lib/publish";
import { getSecretKey } from "../../../../lib/supabase/admin";

// Publishes approved posts that are due (PRD section 12). Called by cron-job.org (or any scheduler) every 15 minutes:
//   POST /api/cron/publish  with  Authorization: Bearer <CRON_SECRET>
// Idempotent and safe to overlap: each post is claimed once. Answers with counts only, never post text.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request.headers.get("authorization"))) return new NextResponse("Unauthorized", { status: 401 });
  if (!getSecretKey()) return new NextResponse("Not configured", { status: 503 });
  try {
    return NextResponse.json({ ok: true, ...(await publishDue({ budgetMs: 40_000 })) });
  } catch (error) {
    console.error("[publish] Run failed:", error);
    // Only callers with the secret see this, so the reason is safe to return (never post text or tokens).
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
