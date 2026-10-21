import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "./lib/redirect";
import { getSupabaseConfig } from "./lib/supabase/env";

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  const pathname = request.nextUrl.pathname;
  const protectedPath = pathname === "/app" || pathname.startsWith("/app/");
  // The admin area (D-032) has its own sign-in; its pages check the admins table and access code themselves.
  const adminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const adminPublic = ["/admin/login", "/admin/signup", "/admin/signout"].includes(pathname);
  const onboardingPath = pathname === "/app/onboarding";
  // A signed-in member never sees sign-in or sign-up: they land in the workspace instead.
  const guestOnlyPath = pathname === "/" || pathname === "/login" || pathname === "/signup";

  if (!config) {
    if (protectedPath) return NextResponse.redirect(new URL("/login?setup=1", publicOrigin(request)));
    if (adminPath && !adminPublic) return NextResponse.redirect(new URL("/admin/login", publicOrigin(request)));
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Redirects carry the cookies Supabase just refreshed or cleared.
  const redirect = (path: string) => {
    // On the address the browser is on: request.url reads https://localhost:3000 behind a tunnel. (The proxy
    // needs an absolute URL; route handlers use relative ones.)
    const target = NextResponse.redirect(new URL(path, publicOrigin(request)));
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
    return target;
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (adminPath) return !user && !adminPublic ? redirect("/admin/login") : response;
  if (!user) {
    if (!protectedPath) return response;
    return redirect(pathname === "/app" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
  }

  // An admin account has no workspace (D-032): it goes to the admin area instead.
  const { isActive, onboarded, admin } = await memberState(supabase, user.id);
  if (admin) return redirect("/admin");
  // A suspended account is signed out here, so it can't sit on a session, and sign-in says why.
  if (!isActive) {
    await supabase.auth.signOut();
    return protectedPath || pathname === "/login" ? redirect("/login?suspended=1") : redirect(pathname + request.nextUrl.search);
  }
  // New members finish onboarding first; finished members don't see it again.
  if (protectedPath && !onboarded && !onboardingPath) return redirect("/app/onboarding");
  if (guestOnlyPath) return redirect(onboarded ? "/app" : "/app/onboarding");
  return response;
}

type ProxyClient = ReturnType<typeof createServerClient>;

async function memberState(supabase: ProxyClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_status, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if (!error && data) return { isActive: data.account_status === "active", onboarded: Boolean(data.onboarding_completed_at), admin: false };
  // No member profile: an admin account, or an account that shouldn't be signed in.
  if (!error) {
    const { data: admin } = await supabase.rpc("is_admin_account");
    return { isActive: false, onboarded: false, admin: admin === true };
  }
  // Database without the onboarding migration yet: fall back to the access check alone.
  const { data: active, error: accessError } = await supabase.rpc("is_active_member");
  return { isActive: !accessError && active === true, onboarded: true, admin: false };
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/login", "/signup"],
};
