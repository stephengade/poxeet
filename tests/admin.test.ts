import { describe, expect, it } from "vitest";
import { byCurrency, money, moneyTotals, purchasesCsv } from "../lib/admin/format";
import { codeMatches, codeProblem, hashCode, newStartingCode, sessionToken, sessionValid } from "../lib/admin/code";
import { aiSourceOf, checkAdminChange, checkMemberChange, describeAudit, expiryFrom, inviteState, newAccessCode } from "../lib/admin/rules";
import type { AdminPurchase } from "../lib/admin/types";

// The admin area's rules (D-031, D-032): what an admin may change, access codes and the admin session, invite
// codes and expiries, how the audit log reads, and the purchases export.

describe("checkMemberChange", () => {
  it("takes a whole-number cap from 1 to 1,000", () => {
    for (const cap of [0, -5, 1.5, 1001, Number.NaN]) expect(checkMemberChange({ cap })).toMatch(/whole number/);
    expect(checkMemberChange({ cap: 1000, instanceKey: true, suspended: true })).toBeNull();
  });
});

describe("checkAdminChange", () => {
  const other = { id: "admin-2", status: "active" as const };

  it("stops an admin disabling themselves or resetting their own code here", () => {
    expect(checkAdminChange({ actorAdminId: "admin-1", target: { id: "admin-1", status: "active" }, activeAdmins: 3, change: "disable" })).toMatch(/disable yourself/);
    expect(checkAdminChange({ actorAdminId: "admin-1", target: { id: "admin-1", status: "active" }, activeAdmins: 3, change: "reset" })).toMatch(/Your access code/);
  });

  it("keeps at least one active admin", () => {
    expect(checkAdminChange({ actorAdminId: "admin-1", target: other, activeAdmins: 1, change: "disable" })).toMatch(/only active admin/);
    expect(checkAdminChange({ actorAdminId: "admin-1", target: other, activeAdmins: 2, change: "disable" })).toBeNull();
    // An invited admin isn't active yet, so disabling them never leaves the instance without one.
    expect(checkAdminChange({ actorAdminId: "admin-1", target: { id: "admin-3", status: "invited" }, activeAdmins: 1, change: "disable" })).toBeNull();
  });

  it("resets only an admin who isn't disabled", () => {
    expect(checkAdminChange({ actorAdminId: "admin-1", target: { id: "admin-2", status: "disabled" }, activeAdmins: 2, change: "reset" })).toMatch(/Enable them/);
    expect(checkAdminChange({ actorAdminId: "admin-1", target: other, activeAdmins: 2, change: "reset" })).toBeNull();
  });
});

describe("admin access codes (D-032)", () => {
  const secret = "s".repeat(40);

  it("takes 8 to 32 digits and refuses obvious ones", () => {
    expect(codeProblem("1234567")).toMatch(/at least 8/);
    expect(codeProblem("1234abcd")).toMatch(/digits only/i);
    expect(codeProblem("11111111")).toMatch(/repeat/);
    expect(codeProblem("12345678")).toMatch(/simple run/);
    expect(codeProblem("98765432")).toMatch(/simple run/);
    expect(codeProblem("4".repeat(3) + "7".repeat(30))).toMatch(/at most 32/);
    expect(codeProblem("40917253")).toBeNull();
    for (let i = 0; i < 20; i++) expect(codeProblem(newStartingCode())).toBeNull();
  });

  it("stores a salted hash that only the same code and secret match", async () => {
    const stored = await hashCode("40917253", secret);
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(stored).not.toContain("40917253");
    expect(await hashCode("40917253", secret)).not.toBe(stored);
    expect(await codeMatches("40917253", stored, secret)).toBe(true);
    expect(await codeMatches("40917254", stored, secret)).toBe(false);
    // Without the server secret, a leaked hash is useless.
    expect(await codeMatches("40917253", stored, "t".repeat(40))).toBe(false);
    expect(await codeMatches("40917253", "plain", secret)).toBe(false);
  });

  it("signs a 12-hour session tied to the user and Supabase session", () => {
    const now = Date.parse("2026-10-20T08:00:00Z");
    const token = sessionToken("user-1", "session-1", now, secret);
    expect(sessionValid(token, "user-1", "session-1", now + 11 * 3600_000, secret)).toBe(true);
    expect(sessionValid(token, "user-1", "session-1", now + 12 * 3600_000 + 1, secret)).toBe(false);
    expect(sessionValid(token, "user-2", "session-1", now, secret)).toBe(false);
    expect(sessionValid(token, "user-1", "session-2", now, secret)).toBe(false);
    expect(sessionValid(token, "user-1", "session-1", now, "t".repeat(40))).toBe(false);
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user-1", s: "session-1", e: now + 999 * 3600_000 })).toString("base64url");
    expect(sessionValid(`${forged}.${mac}`, "user-1", "session-1", now, secret)).toBe(false);
    expect(sessionValid(`${payload}.`, "user-1", "session-1", now, secret)).toBe(false);
    expect(sessionValid(undefined, "user-1", "session-1", now, secret)).toBe(false);
  });
});

describe("access codes and expiry", () => {
  it("makes 8-character codes without look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(newAccessCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });

  it("reads 7d, 2w, 3m and never, and rejects anything else", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(expiryFrom("7d", now)?.toISOString()).toBe("2026-10-27T12:00:00.000Z");
    expect(expiryFrom("2w", now)?.toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(expiryFrom("3m", now)?.getUTCMonth()).toBe(0);
    expect(expiryFrom("never", now)).toBeNull();
    expect(expiryFrom("soon", now)).toBeUndefined();
    expect(expiryFrom("9999d", now)).toBeUndefined();
  });

  it("says whether an invite joined, is waiting, or has an expired code", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const row = { access_type: "code" as const, access_code: "ABCD2345", access_code_expires_at: "2026-10-19T00:00:00Z" };
    expect(inviteState(row, true, now)).toBe("joined");
    expect(inviteState(row, false, now)).toBe("expired");
    expect(inviteState({ ...row, access_code_expires_at: "2026-11-01T00:00:00Z" }, false, now)).toBe("waiting");
    // Someone who can also join by email isn't stuck when the code expires.
    expect(inviteState({ ...row, access_type: "all" }, false, now)).toBe("waiting");
  });
});

describe("aiSourceOf", () => {
  it("follows key resolution: own key, then the grant, then credits", () => {
    expect(aiSourceOf({ has_own_key: true, master_key_access: "granted", credits: 100 })).toBe("own");
    expect(aiSourceOf({ has_own_key: false, master_key_access: "granted", credits: 100 })).toBe("instance");
    expect(aiSourceOf({ has_own_key: false, master_key_access: "none", credits: 100 })).toBe("credits");
    expect(aiSourceOf({ has_own_key: false, master_key_access: "none", credits: 0 })).toBe("none");
    expect(aiSourceOf({ has_own_key: false, master_key_access: "none", credits: null })).toBe("none");
  });
});

describe("describeAudit", () => {
  it("names the member and the change", () => {
    expect(describeAudit("member.cap", { from: 20, to: 100 }, "Ada Obi")).toEqual({ kind: "ai", text: "Changed Ada Obi's daily cap", detail: "20 → 100 AI calls a day" });
    expect(describeAudit("member.instance_key", { granted: false }, "Ada Obi").text).toBe("Removed the instance key from Ada Obi");
    expect(describeAudit("credits.grant", { amount: -50, note: "Duplicate" }, "Kemi")).toEqual({ kind: "credits", text: "Took 50 credits from Kemi", detail: "Note: \"Duplicate\"" });
    expect(describeAudit("signup.mode", { from: "open", to: "invite_only" }, "").text).toBe("Changed sign-up to invite only");
    expect(describeAudit("invite.add", { how: "all", instanceKey: true, sent: true }, "Ngozi").detail).toBe("Email or access code · instance key on joining · invite emailed");
    expect(describeAudit("member.suspend", {}, "Bola").kind).toBe("account");
    expect(describeAudit("admin.reset_code", {}, "Tola")).toMatchObject({ kind: "admins", text: "Reset Tola's access code" });
  });
});

describe("purchases export and totals", () => {
  const row = (fields: Partial<AdminPurchase>): AdminPurchase => ({
    id: "p", memberId: "m", name: "Ada Obi", email: "ada@example.com", at: "2026-10-20T10:30:00.000Z", pack: "Plus", credits: 1650,
    amount: 15, currency: "USD", status: "paid", refunded: 0, shortfall: 0, ...fields,
  });

  it("writes one line per purchase, quoting commas and neutralising formulas", () => {
    const csv = purchasesCsv([row({}), row({ name: "=HYPERLINK(\"x\")", pack: "Plus, yearly", refunded: 5, status: "partially_refunded" })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Date (UTC),Member,Email,Pack,Credits,Amount,Currency,Status,Refunded,Credits not recovered");
    expect(lines[1]).toBe("2026-10-20 10:30,Ada Obi,ada@example.com,Plus,1650,15.00,USD,paid,0.00,0");
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain(`"Plus, yearly"`);
  });

  it("keeps currencies apart", () => {
    const totals = byCurrency([row({ amount: 15 }), row({ amount: 5.5 }), row({ amount: 10, currency: "EUR" })], (r) => r.currency, (r) => r.amount);
    expect(totals).toEqual({ USD: 20.5, EUR: 10 });
    expect(moneyTotals(totals)).toBe("$20.50 · €10");
    expect(moneyTotals({})).toBe("$0");
    expect(money(68)).toBe("$68");
  });
});
