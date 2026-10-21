import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "../../../components/auth/auth-shell";
import { Skeleton } from "../../../components/ui";
import { createClient } from "../../../lib/supabase/server";
import { OnboardingFlow } from "./onboarding-flow";

async function Onboarding() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/onboarding");
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, timezone, posting_slots, onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (profile?.onboarding_completed_at) redirect("/app");
  return (
    <OnboardingFlow
      userId={user.id}
      firstName={profile?.first_name ?? null}
      lastName={profile?.last_name ?? null}
      email={profile?.email ?? user.email ?? ""}
      timezone={profile?.timezone ?? "UTC"}
      slots={Array.isArray(profile?.posting_slots) ? profile.posting_slots : []}
    />
  );
}

export default function OnboardingPage() {
  return (
    <AuthShell wide nav={false}>
      <Suspense fallback={<Skeleton lines={6} />}>
        <Onboarding />
      </Suspense>
    </AuthShell>
  );
}
