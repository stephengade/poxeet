import { NextResponse } from "next/server";
import { exportMemberData } from "../../../../../../lib/member-data";
import { createClient } from "../../../../../../lib/supabase/server";

// Settings → Your data → Export: the member's posts, voice versions, brief, calendars and scheduled posts as one
// JSON file (D-030). Read with the member's own session, so RLS keeps it to their rows.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in to export your data.", { status: 401 });
  try {
    const data = await exportMemberData(supabase, user.id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="poxeet-export-${data.exported_at.slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export] Failed:", error);
    return new NextResponse("We couldn't build your export. Try again in a minute.", { status: 500 });
  }
}
