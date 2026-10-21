import { describe, expect, it, vi } from "vitest";
import { cronAuthorized } from "../lib/cron";
import { postUrl, publishPost } from "../lib/linkedin";
import { decideOutcome, MAX_ATTEMPTS } from "../lib/publish";

// Publishing without a network or a database: the LinkedIn call, what each result does, and the cron secret.

const NOW = new Date("2026-10-26T08:00:30Z");

describe("decideOutcome", () => {
  it("records a sent post with its URN", () => {
    expect(decideOutcome({ ok: true, urn: "urn:li:share:1" }, 1, NOW)).toEqual({
      post: { status: "posted", posted_at: NOW.toISOString(), posted_via: "api", linkedin_post_urn: "urn:li:share:1", last_error: null },
    });
  });

  it("keeps the post approved and expires the connection on 401, without spending an attempt", () => {
    const outcome = decideOutcome({ ok: false, kind: "auth", status: 401, message: "ended" }, 1);
    expect(outcome).toMatchObject({ post: { status: "approved", attempts: 0 }, connection: "expired", notify: "disconnected" });
  });

  it("asks for re-consent on 403", () => {
    expect(decideOutcome({ ok: false, kind: "permission", status: 403, message: "no" }, 1)).toMatchObject({ connection: "needs_reconsent", post: { status: "approved" } });
  });

  it("fails a post LinkedIn refused, with no retry", () => {
    expect(decideOutcome({ ok: false, kind: "content", status: 422, message: "too long" }, 1)).toEqual({ post: { status: "failed", last_error: "too long" }, notify: "failed" });
  });

  it("retries rate limits and server errors until the last attempt", () => {
    expect(decideOutcome({ ok: false, kind: "rate", status: 429, message: "slow" }, 1).post.status).toBe("approved");
    expect(decideOutcome({ ok: false, kind: "server", status: 503, message: "down" }, MAX_ATTEMPTS - 1).post.status).toBe("approved");
    const last = decideOutcome({ ok: false, kind: "server", status: 503, message: "down" }, MAX_ATTEMPTS);
    expect(last).toMatchObject({ post: { status: "failed" }, notify: "failed" });
  });

  it("never re-sends a post whose result is unknown", () => {
    expect(decideOutcome({ ok: false, kind: "unknown", status: null, message: "no answer" }, 1).post.status).toBe("needs_check");
  });
});

describe("publishPost", () => {
  const input = { accessToken: "token-123", personUrn: "urn:li:person:abc", text: "Most roadmaps are wishlists.\n\n#product" };

  it("posts the self-serve UGC body and reads the URN from x-restli-id", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 201, headers: { "x-restli-id": "urn:li:share:999" } }));
    expect(await publishPost(input, fetch)).toEqual({ ok: true, urn: "urn:li:share:999" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.linkedin.com/v2/ugcPosts");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer token-123");
    expect(headers.get("x-restli-protocol-version")).toBe("2.0.0");
    expect(JSON.parse(String(init.body))).toEqual({
      author: "urn:li:person:abc",
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: input.text }, shareMediaCategory: "NONE" } },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    });
  });

  it("sorts LinkedIn's errors into what the publisher does next", async () => {
    const answer = (status: number, body = {}) => vi.fn(async () => Response.json(body, { status }));
    expect(await publishPost(input, answer(401))).toMatchObject({ ok: false, kind: "auth" });
    expect(await publishPost(input, answer(403))).toMatchObject({ ok: false, kind: "permission" });
    expect(await publishPost(input, answer(422, { message: "Content is a duplicate" }))).toMatchObject({ ok: false, kind: "content", message: expect.stringContaining("duplicate") });
    expect(await publishPost(input, answer(429))).toMatchObject({ ok: false, kind: "rate" });
    expect(await publishPost(input, answer(502))).toMatchObject({ ok: false, kind: "server" });
  });

  it("treats a timeout as unknown (it may have gone out) and a refused connection as retryable", async () => {
    const timeout = vi.fn(async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); });
    expect(await publishPost(input, timeout)).toMatchObject({ ok: false, kind: "unknown" });
    const refused = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await publishPost(input, refused)).toMatchObject({ ok: false, kind: "server" });
  });

  it("builds a post link from its URN", () => {
    expect(postUrl("urn:li:share:999")).toBe("https://www.linkedin.com/feed/update/urn:li:share:999/");
  });
});

describe("cronAuthorized", () => {
  const secret = "a-long-enough-cron-secret-0123456789";

  it("accepts only the right bearer secret", () => {
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
    expect(cronAuthorized("Bearer ", secret)).toBe(false);
  });

  it("refuses every call when no secret (or a short one) is set", () => {
    expect(cronAuthorized("Bearer anything", undefined)).toBe(false);
    expect(cronAuthorized("Bearer short", "short")).toBe(false);
  });
});
