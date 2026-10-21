import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../lib/turnstile";

// No network: Cloudflare's siteverify is replaced with a mock.

describe("verifyTurnstile", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips the check when the form shows no widget", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(await verifyTurnstile(undefined)).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the site key is set but the secret is not", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile("token")).toEqual({ ok: false, reason: "not_configured" });
  });

  it("refuses a missing token without calling Cloudflare", async () => {
    expect(await verifyTurnstile(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the secret, token and IP to siteverify and reads the answer", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
    expect(await verifyTurnstile("token", "203.0.113.7")).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = new URLSearchParams(init.body);
    expect(body.get("secret")).toBe("secret-key");
    expect(body.get("response")).toBe("token");
    expect(body.get("remoteip")).toBe("203.0.113.7");

    fetchMock.mockResolvedValueOnce(Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    expect(await verifyTurnstile("used-token")).toEqual({ ok: false, reason: "invalid", codes: ["timeout-or-duplicate"] });
  });

  it("fails closed when Cloudflare can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await verifyTurnstile("token")).toEqual({ ok: false, reason: "unavailable" });
  });
});
