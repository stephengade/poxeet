import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only client with the secret key: it bypasses Row Level Security. Use it in API routes and cron jobs,
// never in a component. Supabase calls the key SUPABASE_SECRET_KEY now; SUPABASE_SERVICE_ROLE_KEY is the legacy name.
export function getSecretKey() {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("The admin client is server-only.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSecretKey();
  if (!url || !key) throw new Error("Supabase admin access is not configured. Set SUPABASE_SECRET_KEY.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
