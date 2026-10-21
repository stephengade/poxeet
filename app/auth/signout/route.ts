import { NextResponse, type NextRequest } from "next/server";
import { seeOther, sameOrigin } from "../../../lib/redirect";
import { createClient } from "../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const supabase = await createClient();
  await supabase.auth.signOut();
  return seeOther("/");
}
