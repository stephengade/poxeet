import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, linkedInConfig, newState, redirectUri, STATE_COOKIE, STATE_MAX_AGE } from "../../../../lib/linkedin";
import { publicOrigin, seeOther, sameOrigin } from "../../../../lib/redirect";
import { createClient } from "../../../../lib/supabase/server";

// Starts "Connect LinkedIn". POST from a form, never a link, so a prefetch can't start a sign-in.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });

  const back = (result: string) => seeOther(`/app/settings/channels?linkedin=${result}`);
  const config = linkedInConfig();
  if (!config) {
    console.error("[linkedin] Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.");
    return back("not_configured");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return seeOther("/login?next=/app/settings/channels");

  const { state, cookie } = newState(user.id, config.clientSecret);
  const response = NextResponse.redirect(authorizeUrl({ clientId: config.clientId, state, redirect: redirectUri(publicOrigin(request)) }), { status: 303 });
  response.cookies.set(STATE_COOKIE, cookie, {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/linkedin", maxAge: STATE_MAX_AGE,
  });
  return response;
}
