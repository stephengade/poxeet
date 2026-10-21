import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "../../../lib/admin/code";
import { seeOther, sameOrigin } from "../../../lib/redirect";
import { createClient } from "../../../lib/supabase/server";

/** Ends the admin session and the Supabase session, then back to the admin sign-in. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = seeOther("/admin/login");
  response.cookies.set(SESSION_COOKIE, "", { path: "/admin", maxAge: 0, httpOnly: true, sameSite: "strict" });
  return response;
}
