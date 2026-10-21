import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUser, hasLocalSupabase, signedInUser, uniqueEmail } from "./helpers/local-supabase";

// The admin read functions (202610200011_admin_reads.sql) against a local Supabase: the service role gets counts per
// member; a signed-in member can't call them or read the audit log.
describe.skipIf(!hasLocalSupabase)("admin functions", () => {
  type User = Awaited<ReturnType<typeof signedInUser>>;
  let member: User;

  beforeAll(async () => {
    member = await signedInUser(uniqueEmail("admin-db"));
    const db = admin();
    await db.from("profiles").update({ master_key_access: "granted" }).eq("id", member.id);
    await db.from("generation_usage").insert([
      { user_id: member.id, job: "draft", model: "test", input_tokens: 10, output_tokens: 10, used_master_key: true },
      { user_id: member.id, job: "draft", model: "test", input_tokens: 10, output_tokens: 10, used_master_key: true },
      { user_id: member.id, job: "draft", model: "test", input_tokens: 10, output_tokens: 10, used_master_key: false },
    ]);
  });

  afterAll(async () => {
    await deleteUser(member.id);
  });

  it("gives the service role counts per member, never content", async () => {
    const { data, error } = await admin().rpc("admin_members");
    expect(error).toBeNull();
    const row = (data as Array<Record<string, unknown>>).find((item) => item.id === member.id)!;
    expect(row).toMatchObject({ master_key_access: "granted", used_today: 2, calls_7d: 3, has_own_key: false, published_30d: 0 });
    expect(Object.keys(row)).not.toContain("brief");

    const { data: days } = await admin().rpc("admin_instance_calls", { p_days: 14 });
    expect(days).toHaveLength(14);
    expect((days as Array<{ calls: number }>).at(-1)!.calls).toBeGreaterThanOrEqual(2);
  });

  it("refuses members", async () => {
    for (const [fn, args] of [["admin_members", {}], ["admin_instance_calls", { p_days: 14 }], ["admin_credit_totals", { p_since: "2026-01-01" }]] as const) {
      const { error } = await member.client.rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
    const { data } = await member.client.from("admin_audit_logs").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("keeps admins out of reach of members, and gives admin accounts no member profile (D-032)", async () => {
    const db = admin();
    const email = uniqueEmail("admin-account");
    await db.from("admins").insert({ email, name: "Test Admin", code_hash: "scrypt$1$1$1$x$y" });
    // Invited admins can sign up even when sign-up is invite only and they're not on the access list.
    const { data: created, error } = await db.auth.admin.createUser({ email, password: `Test-${crypto.randomUUID()}`, email_confirm: true });
    expect(error).toBeNull();
    const { data: profile } = await db.from("profiles").select("id").eq("id", created.user!.id).maybeSingle();
    expect(profile).toBeNull();

    const { data: rows } = await member.client.from("admins").select("id");
    expect(rows ?? []).toEqual([]);
    const { data: isAdmin } = await member.client.rpc("is_admin_account");
    expect(isAdmin).toBe(false);

    await db.auth.admin.deleteUser(created.user!.id);
    await db.from("admins").delete().eq("email", email);
  });
});
