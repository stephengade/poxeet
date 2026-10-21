import { after, type NextRequest } from "next/server";
import { seal, toBytea } from "../../../../lib/crypto";
import { exchangeCode, fetchMember, linkedInConfig, redirectUri, STATE_COOKIE, stateMatches } from "../../../../lib/linkedin";
import { sendAccountNotice } from "../../../../lib/notify";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { publicOrigin, seeOther } from "../../../../lib/redirect";
import { createClient } from "../../../../lib/supabase/server";

// LinkedIn sends the member back here. Nothing is stored unless the state matches this member's cookie.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const back = (result: string) => {
    const response = seeOther(`/app/settings/channels?linkedin=${result}`);
    response.cookies.set(STATE_COOKIE, "", { path: "/api/linkedin", maxAge: 0 });
    return response;
  };

  const config = linkedInConfig();
  if (!config) return back("not_configured");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return seeOther("/login?next=/app/settings/channels");

  if (!stateMatches(request.cookies.get(STATE_COOKIE)?.value, params.get("state"), user.id, config.clientSecret)) {
    // Covers a stale tab, a link opened in another browser, or a forged callback.
    return back("expired");
  }
  // The member pressed Cancel on LinkedIn, or LinkedIn refused.
  if (params.get("error")) return back(params.get("error") === "user_cancelled_authorize" || params.get("error") === "user_cancelled_login" ? "cancelled" : "denied");
  const code = params.get("code");
  if (!code) return back("denied");

  try {
    const token = await exchangeCode({ code, redirect: redirectUri(publicOrigin(request)), ...config });
    if (!token.scopes.includes("w_member_social")) return back("no_posting");
    const member = await fetchMember(token.accessToken);
    const sealed = seal(token.accessToken);
    const admin = createAdminClient();
    const { data: earlier } = await admin.from("linkedin_connections").select("user_id").eq("user_id", user.id).maybeSingle();
    const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
    const { error } = await admin.from("linkedin_connections").upsert({
      user_id: user.id,
      person_urn: member.personUrn,
      display_name: member.name,
      scopes: token.scopes,
      ciphertext: toBytea(sealed.ciphertext),
      iv: toBytea(sealed.iv),
      tag: toBytea(sealed.tag),
      key_version: sealed.keyVersion,
      expires_at: expiresAt,
      status: "active",
      connected_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;
    // A security notice: tells the member (or whoever owns the inbox) that posting access was granted.
    after(() => sendAccountNotice(user.id, "linkedinConnected", { linkedinName: member.name, expiresAt, reconnected: Boolean(earlier) }));
    return back("connected");
  } catch (error) {
    console.error("[linkedin] Connecting failed:", error instanceof Error ? error.message : error);
    return back("error");
  }
}
