import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capReachedMessage, capWindow, checkKey, resolveAiAccess } from "../lib/ai/server";
import { fromBytea, seal, toBytea, unseal } from "../lib/crypto";

// No network: each provider SDK gets a fake fetch, and the admin Supabase client is a fake over `db` below.

const db = vi.hoisted(() => ({
  ownKey: null as Record<string, string> | null,
  profile: null as { master_key_access: string; daily_generation_cap: number; account_status?: string } | null,
  usedToday: 0,
  usageFilters: [] as Array<[string, unknown]>,
}));

vi.mock("../lib/supabase/admin", () => ({
  getSecretKey: () => "test",
  createAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { if (table === "generation_usage") db.usageFilters.push([column, value]); return query; },
        gte: (column: string, value: unknown) => { db.usageFilters.push([column, value]); return query; },
        maybeSingle: async () => ({ data: table === "user_api_keys" ? db.ownKey : db.profile, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ count: db.usedToday, data: null, error: null }),
      };
      return query;
    },
  }),
}));

describe("seal and unseal", () => {
  beforeEach(() => { vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64")); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("round-trips through bytea and rejects tampering", () => {
    const sealed = seal("sk-test-1234567890");
    const stored = { ciphertext: toBytea(sealed.ciphertext), iv: toBytea(sealed.iv), tag: toBytea(sealed.tag) };
    expect(stored.ciphertext.startsWith("\\x")).toBe(true);
    expect(unseal({ ciphertext: fromBytea(stored.ciphertext), iv: fromBytea(stored.iv), tag: fromBytea(stored.tag) })).toBe("sk-test-1234567890");

    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] ^= 1;
    expect(() => unseal({ ...sealed, ciphertext: tampered })).toThrow();
  });

  it("refuses to run without a 32-byte key", () => {
    vi.stubEnv("ENCRYPTION_KEY", "too-short");
    expect(() => seal("x")).toThrow(/32 bytes/);
  });
});

describe("checkKey", () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const answer = (status: number) => vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(status === 200 ? { data: [], object: "list", has_more: false } : { error: { message: "nope", type: "error" } }), {
      status, headers: { "content-type": "application/json" },
    });
  });
  beforeEach(() => { calls.length = 0; });

  it("lists models with each provider's own endpoint and auth header", async () => {
    expect(await checkKey("anthropic", "sk-ant-key", { fetch: answer(200) })).toEqual({ ok: true });
    expect(calls[0].url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/);
    expect(calls[0].headers.get("x-api-key")).toBe("sk-ant-key");

    expect(await checkKey("deepseek", "sk-deep", { fetch: answer(200) })).toEqual({ ok: true });
    expect(calls[1].url).toMatch(/^https:\/\/api\.deepseek\.com\/models/);
    expect(calls[1].headers.get("authorization")).toBe("Bearer sk-deep");

    expect(await checkKey("openai", "sk-open", { fetch: answer(200) })).toEqual({ ok: true });
    expect(calls[2].url).toMatch(/^https:\/\/api\.openai\.com\/v1\/models/);
  });

  it("explains rejected keys, and treats a rate limit as a working key", async () => {
    expect(await checkKey("deepseek", "sk-bad", { fetch: answer(401) })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await checkKey("anthropic", "sk-ant-bad", { fetch: answer(401) })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await checkKey("openai", "sk-noperm", { fetch: answer(403) })).toMatchObject({ ok: false, reason: "no_access" });
    expect(await checkKey("deepseek", "sk-busy", { fetch: answer(429) })).toEqual({ ok: true });
  });

  it("says when the provider can't be reached", async () => {
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await checkKey("deepseek", "sk-deep", { fetch: down as unknown as typeof fetch })).toMatchObject({ ok: false, reason: "unreachable" });
  });
});

describe("resolveAiAccess daily cap (KEY-3)", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("AI_PROVIDER", "deepseek");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-instance");
    vi.stubEnv("BILLING_ENABLED", "");
    vi.useFakeTimers({ now: new Date("2026-10-20T15:30:00Z"), toFake: ["Date"] });
    Object.assign(db, { ownKey: null, profile: { master_key_access: "granted", daily_generation_cap: 3 }, usedToday: 0, usageFilters: [] });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("lets an instance-key member through under the cap, counting today's instance-key calls only", async () => {
    db.usedToday = 2;
    expect(await resolveAiAccess("user-1")).toMatchObject({ ok: true, access: { source: "instance_key", apiKey: "sk-instance" } });
    expect(db.usageFilters).toEqual([["user_id", "user-1"], ["used_master_key", true], ["created_at", "2026-10-20T00:00:00.000Z"]]);
  });

  it("refuses once today's calls reach the cap, saying when it resets", async () => {
    db.usedToday = 3;
    const result = await resolveAiAccess("user-1");
    expect(result).toMatchObject({ ok: false, reason: "cap_reached" });
    expect(!result.ok && result.message).toBe(capReachedMessage(3, new Date("2026-10-21T00:00:00Z")));
    expect(!result.ok && result.message).toMatch(/3 AI calls.*00:00 UTC/);
  });

  it("doesn't cap a member on their own key", async () => {
    const sealed = seal("sk-own");
    db.ownKey = { provider: "anthropic", ciphertext: toBytea(sealed.ciphertext), iv: toBytea(sealed.iv), tag: toBytea(sealed.tag) };
    db.usedToday = 500;
    expect(await resolveAiAccess("user-1")).toMatchObject({ ok: true, access: { source: "own_key", apiKey: "sk-own" } });
    expect(db.usageFilters).toEqual([]);
  });

  it("runs no AI for a suspended account, whatever key it has", async () => {
    const sealed = seal("sk-own");
    db.ownKey = { provider: "anthropic", ciphertext: toBytea(sealed.ciphertext), iv: toBytea(sealed.iv), tag: toBytea(sealed.tag) };
    db.profile = { master_key_access: "granted", daily_generation_cap: 100, account_status: "suspended" };
    expect(await resolveAiAccess("user-1")).toMatchObject({ ok: false, reason: "no_access", message: expect.stringMatching(/suspended/) });
  });

  it("counts the cap per UTC day", () => {
    expect(capWindow(new Date("2026-10-20T23:59:59Z"))).toEqual({ start: new Date("2026-10-20T00:00:00Z"), resets: new Date("2026-10-21T00:00:00Z") });
    expect(capWindow(new Date("2026-10-21T00:00:00Z")).start).toEqual(new Date("2026-10-21T00:00:00Z"));
  });
});
