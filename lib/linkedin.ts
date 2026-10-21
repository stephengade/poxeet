import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// LinkedIn sign-in for posting (PRD section 10). Server only: uses the app's client secret.
// Products on the LinkedIn app: "Share on LinkedIn" (w_member_social) and "Sign In with LinkedIn using
// OpenID Connect" (openid, profile, email). Tokens last about 60 days; self-serve apps get no refresh token.

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const REVOKE_URL = "https://www.linkedin.com/oauth/v2/revoke";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];

export const STATE_COOKIE = "px_li_state";
export const STATE_MAX_AGE = 10 * 60;

type Fetch = typeof fetch;

export function linkedInConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Must be byte-identical in the authorize request and the token exchange, and registered on the LinkedIn app. */
export function redirectUri(origin: string) {
  return process.env.LINKEDIN_REDIRECT_URI?.trim() || `${origin}/api/linkedin/callback`;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** A random state, plus the cookie that ties it to this member: "<state>.<userId>.<signature>". */
export function newState(userId: string, secret: string) {
  const state = randomBytes(24).toString("base64url");
  return { state, cookie: `${state}.${userId}.${sign(`${state}.${userId}`, secret)}` };
}

/** The callback's check: the cookie is ours, it matches the returned state, and it belongs to this member. */
export function stateMatches(cookie: string | undefined, state: string | null, userId: string, secret: string) {
  if (!cookie || !state) return false;
  const [cookieState, cookieUser, signature] = cookie.split(".");
  if (!cookieState || !cookieUser || !signature) return false;
  const expected = Buffer.from(sign(`${cookieState}.${cookieUser}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return cookieState === state && cookieUser === userId;
}

export function authorizeUrl({ clientId, state, redirect }: { clientId: string; state: string; redirect: string }) {
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirect, state, scope: LINKEDIN_SCOPES.join(" ") });
  return `${AUTHORIZE_URL}?${params}`;
}

export type LinkedInToken = { accessToken: string; expiresIn: number; scopes: string[] };

export async function exchangeCode(input: { code: string; redirect: string; clientId: string; clientSecret: string }, fetcher: Fetch = fetch): Promise<LinkedInToken> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirect, client_id: input.clientId, client_secret: input.clientSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!response.ok || !body.access_token || !body.expires_in) throw new Error(`LinkedIn token exchange failed: ${body.error ?? response.status} ${body.error_description ?? ""}`.trim());
  return { accessToken: body.access_token, expiresIn: body.expires_in, scopes: (body.scope ?? "").split(/[\s,]+/).filter(Boolean) };
}

export type LinkedInMember = { sub: string; name: string | null; personUrn: string };

/** OpenID userinfo: the member's subject id and name. Email is optional and not needed. */
export async function fetchMember(accessToken: string, fetcher: Fetch = fetch): Promise<LinkedInMember> {
  const response = await fetcher(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  const body = (await response.json().catch(() => ({}))) as { sub?: string; name?: string; given_name?: string; family_name?: string };
  if (!response.ok || !body.sub) throw new Error(`LinkedIn userinfo failed: ${response.status}`);
  const name = body.name || [body.given_name, body.family_name].filter(Boolean).join(" ") || null;
  // The OpenID subject is the member id used in Person URNs. Confirm with the first real post (PRD section 10).
  return { sub: body.sub, name, personUrn: `urn:li:person:${body.sub}` };
}

/** Best effort: tells LinkedIn to forget the token. Disconnecting still succeeds if this fails. */
export async function revokeToken(input: { token: string; clientId: string; clientSecret: string }, fetcher: Fetch = fetch) {
  try {
    await fetcher(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: input.token, client_id: input.clientId, client_secret: input.clientSecret }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* ignored: the row is deleted either way */ }
}

const UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";

/** How a send ended, mapped to what the publisher does next (PRD section 10, failure handling). */
export type PublishResult =
  | { ok: true; urn: string | null }
  /** auth: token revoked or expired (401). permission: missing w_member_social (403). content: LinkedIn refused the
   *  text (400, 422). rate: 429. server: 5xx. unknown: the request may have reached LinkedIn but we got no answer. */
  | { ok: false; kind: "auth" | "permission" | "content" | "rate" | "server" | "unknown"; status: number | null; message: string };

/**
 * Publishes a text post to the member's own profile through the self-serve Share on LinkedIn product:
 * POST /v2/ugcPosts with X-Restli-Protocol-Version 2.0.0. The new post's URN comes back in the x-restli-id header.
 * Never logs the text or the token.
 */
export async function publishPost(input: { accessToken: string; personUrn: string; text: string }, fetcher: Fetch = fetch): Promise<PublishResult> {
  let response: Response;
  try {
    response = await fetcher(UGC_POSTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify({
        author: input.personUrn,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: input.text }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    // A timeout or a dropped connection: LinkedIn may have published it. Never send it again automatically.
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, kind: timedOut ? "unknown" : "server", status: null, message: timedOut ? "LinkedIn didn't answer in time." : "We couldn't reach LinkedIn." };
  }
  if (response.ok) {
    const urn = response.headers.get("x-restli-id") ?? ((await response.json().catch(() => ({}))) as { id?: string }).id ?? null;
    return { ok: true, urn };
  }
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  const detail = body.message ? `: ${body.message.slice(0, 200)}` : "";
  if (response.status === 401) return { ok: false, kind: "auth", status: 401, message: "LinkedIn access ended. Reconnect LinkedIn to keep posting." };
  if (response.status === 403) return { ok: false, kind: "permission", status: 403, message: "LinkedIn didn't allow posting. Reconnect and accept every permission." };
  if (response.status === 429) return { ok: false, kind: "rate", status: 429, message: "LinkedIn asked us to slow down. We'll try again shortly." };
  if (response.status >= 500) return { ok: false, kind: "server", status: response.status, message: `LinkedIn had a problem (${response.status}). We'll try again.` };
  return { ok: false, kind: "content", status: response.status, message: `LinkedIn didn't accept this post${detail}. Edit it, then approve it again.` };
}

/** The public link of a published post, from its URN. */
export function postUrl(urn: string) {
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(urn).replace(/%3A/gi, ":")}/`;
}
