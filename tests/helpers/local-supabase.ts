import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Database tests run only against a local Supabase (`supabase start`), never a hosted project:
// they create users, flip instance settings and delete rows.
const url = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_KEY;

export const hasLocalSupabase = Boolean(anonKey && serviceKey) && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export function admin(): SupabaseClient {
  return createClient(url, serviceKey!, options);
}

export function anon(): SupabaseClient {
  return createClient(url, anonKey!, options);
}

/**
 * Creates a confirmed user and returns a client signed in as them. The email goes on the access list first
 * (keeping any row a test already added), so this works whether the instance is open or invite-only.
 */
export async function signedInUser(email: string) {
  const password = `Test-${crypto.randomUUID()}`;
  const { error: allowError } = await admin().from("allowlist").upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
  if (allowError) throw allowError;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("No user created.");
  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

/** Deletes the user and their access-list row. */
export async function deleteUser(id: string) {
  const db = admin();
  const { data } = await db.auth.admin.getUserById(id);
  await db.auth.admin.deleteUser(id);
  if (data.user?.email) await db.from("allowlist").delete().eq("email", data.user.email.toLowerCase());
}

export function uniqueEmail(label: string) {
  return `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
}
