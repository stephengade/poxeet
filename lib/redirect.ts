import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "./config";

// Behind a proxy or tunnel (cloudflared locally, a load balancer in production) Next reports request.url as
// https://localhost:3000, not the address the browser is on. So redirects are relative, and anything that needs
// the real address (an origin check, an OAuth callback URL) reads it from the forwarded headers.

/**
 * A 303 to a path on this site, as a relative Location: the browser resolves it against the address it is
 * actually on. For route handlers only; proxy.ts must redirect to an absolute URL (use publicOrigin there).
 */
export function seeOther(path: string) {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

/** The address the browser used, e.g. https://name.trycloudflare.com, from X-Forwarded-* or Host. */
export function publicOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Whether a form POST came from this site: no Origin header (same-origin navigations may omit it), or an Origin
 * equal to the public address, APP_URL, or the address Next sees.
 */
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return [publicOrigin(request), appUrl(), request.nextUrl.origin].some((allowed) => {
    try {
      return new URL(allowed).origin === origin;
    } catch {
      return false;
    }
  });
}
