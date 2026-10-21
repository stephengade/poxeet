import { describe, expect, it, vi } from "vitest";
import { authorizeUrl, exchangeCode, fetchMember, newState, stateMatches } from "../lib/linkedin";
import { blockingStep, setupSteps, type Member } from "../lib/member";

// No network: LinkedIn's endpoints are replaced with fake fetches.

describe("OAuth state", () => {
  const secret = "client-secret";
  it("accepts only our cookie, for the same state and the same member", () => {
    const { state, cookie } = newState("user-1", secret);
    expect(stateMatches(cookie, state, "user-1", secret)).toBe(true);
    expect(stateMatches(cookie, state, "user-2", secret)).toBe(false);
    expect(stateMatches(cookie, "other-state", "user-1", secret)).toBe(false);
    expect(stateMatches(cookie, state, "user-1", "another-secret")).toBe(false);
    expect(stateMatches(`${state}.user-1.forged`, state, "user-1", secret)).toBe(false);
    expect(stateMatches(undefined, state, "user-1", secret)).toBe(false);
  });
});

describe("LinkedIn calls", () => {
  it("asks for sign-in and posting scopes", () => {
    const url = new URL(authorizeUrl({ clientId: "abc", state: "s1", redirect: "http://localhost:3000/api/linkedin/callback" }));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(url.searchParams.get("scope")).toBe("openid profile email w_member_social");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/linkedin/callback");
    expect(url.searchParams.get("state")).toBe("s1");
  });

  it("exchanges the code and reads the granted scopes", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(init?.body)).toContain("grant_type=authorization_code");
      return Response.json({ access_token: "tok", expires_in: 5_184_000, scope: "email,openid,profile,w_member_social" });
    });
    const token = await exchangeCode({ code: "c", redirect: "r", clientId: "id", clientSecret: "secret" }, fetcher as typeof fetch);
    expect(token).toEqual({ accessToken: "tok", expiresIn: 5_184_000, scopes: ["email", "openid", "profile", "w_member_social"] });

    const failing = vi.fn(async () => Response.json({ error: "invalid_request", error_description: "bad code" }, { status: 400 }));
    await expect(exchangeCode({ code: "c", redirect: "r", clientId: "id", clientSecret: "secret" }, failing as typeof fetch)).rejects.toThrow(/invalid_request/);
  });

  it("builds the Person URN from the OpenID subject", async () => {
    const fetcher = vi.fn(async () => Response.json({ sub: "AbC123", given_name: "Ann", family_name: "Lee" }));
    expect(await fetchMember("tok", fetcher as typeof fetch)).toEqual({ sub: "AbC123", name: "Ann Lee", personUrn: "urn:li:person:AbC123" });
  });
});

describe("setup order", () => {
  const member = (setup: Partial<Member["setup"]>): Member => ({
    id: "u", email: "a@example.com", firstName: "Ann", lastName: null, name: "Ann", timezone: "UTC", slots: [], paused: false, drafts: 0,
    setup: { linkedin: "disconnected", linkedinAccount: null, ai: "none", credits: null, ownKey: null, importedPosts: 0, ...setup },
  });

  it("locks every step behind the one before it", () => {
    const fresh = setupSteps(member({})).steps;
    expect(fresh.map((step) => [step.id, step.locked, step.href])).toEqual([
      ["linkedin", false, "/app/settings/channels"], ["ai", true, null], ["import", true, null],
    ]);
    expect(blockingStep(member({}), "import")?.id).toBe("linkedin");
    expect(blockingStep(member({ linkedin: "connected" }), "import")?.id).toBe("ai");
    expect(blockingStep(member({ linkedin: "connected", ai: "own_key" }), "import")).toBeNull();
  });

  it("finishes the voice step at 3 posts", () => {
    const ready = { linkedin: "connected", ai: "own_key" } as const;
    const voice = (importedPosts: number) => setupSteps(member({ ...ready, importedPosts })).steps[2];
    expect(voice(0)).toMatchObject({ title: "Teach Poxeet your voice", done: false, href: "/app/import" });
    expect(voice(2).done).toBe(false);
    expect(voice(2).todo).toBe("2 of 3 posts added. Add 1 more to finish.");
    expect(voice(3).done).toBe(true);
    expect(setupSteps(member({ ...ready, importedPosts: 3 })).done).toBe(3);
  });

  it("does not unlock later steps when an earlier one isn't done, even if a later one is", () => {
    // Imported posts from before the order existed don't open AI access without LinkedIn.
    expect(blockingStep(member({ importedPosts: 12 }), "ai")?.id).toBe("linkedin");
  });
});
