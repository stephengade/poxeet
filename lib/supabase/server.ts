import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getSupabaseConfig } from "./env";

export async function createClient() {
  // Request-time only. Cookies alone aren't enough: Next can prerender with cookies available, and the auth
  // client reads the clock (Date.now) to check session expiry, which Next refuses during a prerender.
  await connection();
  const cookieStore = await cookies();
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured yet.");

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes the session.
        }
      },
    },
  });
}
