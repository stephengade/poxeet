import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeNext } from "../lib/auth/schemas";
import { publicOrigin, sameOrigin, seeOther } from "../lib/redirect";

// Behind a tunnel Next sees https://localhost:3000 while the browser is on the tunnel's address.
const TUNNEL = "https://name.trycloudflare.com";
const behindTunnel = (headers: Record<string, string> = {}) =>
  new NextRequest("https://localhost:3000/api/billing/checkout", { method: "POST", headers: { host: "name.trycloudflare.com", "x-forwarded-proto": "https", ...headers } });

describe("redirects behind a proxy", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("redirects with a relative Location, never to localhost", () => {
    const response = seeOther("/app/settings/credits?checkout=paid");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/app/settings/credits?checkout=paid");
  });

  it("reads the public address from the forwarded headers", () => {
    expect(publicOrigin(behindTunnel())).toBe(TUNNEL);
    expect(publicOrigin(behindTunnel({ "x-forwarded-host": "poxeet.example, inner" }))).toBe("https://poxeet.example");
  });

  it("accepts a form posted from the tunnel address and refuses another site", () => {
    expect(sameOrigin(behindTunnel({ origin: TUNNEL }))).toBe(true);
    expect(sameOrigin(behindTunnel())).toBe(true);
    expect(sameOrigin(behindTunnel({ origin: "https://evil.example" }))).toBe(false);
  });

  it("accepts APP_URL's origin", () => {
    vi.stubEnv("APP_URL", "https://poxeet.example/");
    expect(sameOrigin(new NextRequest("http://localhost:3000/x", { method: "POST", headers: { origin: "https://poxeet.example" } }))).toBe(true);
  });
});

describe("the post-sign-in destination (?next=)", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/app/settings/credits?checkout=paid")).toBe("/app/settings/credits?checkout=paid");
    expect(safeNext("/app/posts/1#top")).toBe("/app/posts/1#top");
  });

  it("refuses anything a browser would send to another site", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\evil.example", "/\t/evil.example", "/\n/evil.example", "/%0A", "\/evil.example", " /app", "app"]) {
      const result = safeNext(next);
      expect(new URL(result, "https://poxeet.example").origin, JSON.stringify(next)).toBe("https://poxeet.example");
    }
    expect(safeNext("/\t/evil.example")).toBe("/app");
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext(undefined)).toBe("/app");
  });
});
