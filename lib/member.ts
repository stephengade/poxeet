import { redirect } from "next/navigation";
import { cache } from "react";
import { PROVIDERS, type ProviderId } from "./ai/providers";
import { creditsAvailable } from "./ai/server";
import { GOOD_VOICE_POSTS, MIN_VOICE_POSTS } from "./import/posts";
import { createAdminClient, getSecretKey } from "./supabase/admin";
import { createClient } from "./supabase/server";

// The signed-in member and their setup state, read once per request (React cache) and shared by the
// workroom layout and its pages. Server only.

export type Slot = { day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"; time: string };

export type Member = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  timezone: string;
  slots: Slot[];
  paused: boolean;
  setup: {
    linkedin: "connected" | "expiring" | "disconnected";
    /** The LinkedIn connection, when there is a row: who it is and when access ends. */
    linkedinAccount: { name: string | null; expiresAt: string; expired: boolean } | null;
    /** Their own key (any provider), the operator's master key granted to them, or credits for that key. */
    ai: "own_key" | "instance_key" | "credits" | "none";
    /** Their credit balance when billing is on and credits can be used; null otherwise. */
    credits: number | null;
    /** Their own key, when they saved one: which provider, and its last 4 characters. */
    ownKey: { provider: ProviderId; last4: string; checkedAt: string | null } | null;
    importedPosts: number;
  };
  drafts: number;
};

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const getMember = cache(async (): Promise<Member> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { count: importedPosts }, { count: drafts }] = await Promise.all([
    supabase.from("profiles").select("email, first_name, last_name, display_name, timezone, posting_slots, paused, master_key_access").eq("id", user.id).single(),
    supabase.from("imported_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "draft"),
  ]);

  // Keys and LinkedIn tokens are secrets members can't read; only whether a row exists is looked up here.
  let linkedin: Member["setup"]["linkedin"] = "disconnected";
  let linkedinAccount: Member["setup"]["linkedinAccount"] = null;
  let ownKey: Member["setup"]["ownKey"] = null;
  if (getSecretKey()) {
    const admin = createAdminClient();
    const [{ data: connection }, { data: key }] = await Promise.all([
      admin.from("linkedin_connections").select("status, expires_at, display_name").eq("user_id", user.id).maybeSingle(),
      admin.from("user_api_keys").select("provider, last4, validated_at").eq("user_id", user.id).maybeSingle(),
    ]);
    if (key) ownKey = { provider: key.provider as ProviderId, last4: key.last4, checkedAt: key.validated_at };
    if (connection) {
      const left = new Date(connection.expires_at).getTime() - Date.now();
      const expired = left <= 0 || connection.status !== "active";
      linkedinAccount = { name: connection.display_name, expiresAt: connection.expires_at, expired };
      if (!expired) linkedin = left < WEEK ? "expiring" : "connected";
    }
  }

  // Credits matter only when billing is on, and only to members without their own key or a grant.
  let credits: number | null = null;
  if (creditsAvailable() && getSecretKey()) {
    const { data, error } = await createAdminClient().rpc("current_credits", { p_user: user.id });
    if (error) console.error("[billing] Couldn't read the balance:", error.message);
    else credits = Number(data ?? 0);
  }

  const firstName = profile?.first_name ?? null;
  const lastName = profile?.last_name ?? null;
  const email = profile?.email ?? user.email ?? "";
  return {
    id: user.id,
    email,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || profile?.display_name || email.split("@")[0],
    timezone: profile?.timezone ?? "UTC",
    slots: Array.isArray(profile?.posting_slots) ? (profile.posting_slots as Slot[]) : [],
    paused: profile?.paused ?? false,
    setup: {
      linkedin,
      linkedinAccount,
      ai: ownKey ? "own_key" : profile?.master_key_access === "granted" ? "instance_key" : credits ? "credits" : "none",
      credits,
      ownKey,
      importedPosts: importedPosts ?? 0,
    },
    drafts: drafts ?? 0,
  };
});

export type SetupStep = {
  id: "linkedin" | "ai" | "import";
  title: string;
  done: boolean;
  /** Steps unlock in order: each needs the one before it done. */
  locked: boolean;
  todo: string;
  doneText: string;
  /** Where to do the step; null while it's locked. */
  href: string | null;
};

/**
 * The three first-run steps, in the order they must be done: LinkedIn first (nothing is useful until posts can
 * go out), then AI access, then teaching Poxeet the member's voice with at least MIN_VOICE_POSTS posts (D-023). A step is locked until the one before it is done.
 */
export function setupSteps(member: Member) {
  const linkedinDone = member.setup.linkedin !== "disconnected";
  const aiDone = member.setup.ai !== "none";
  const posts = member.setup.importedPosts;
  const importDone = posts >= MIN_VOICE_POSTS;
  const more = MIN_VOICE_POSTS - posts;
  const account = member.setup.linkedinAccount;
  const steps: SetupStep[] = [
    {
      id: "linkedin", title: "Connect LinkedIn", done: linkedinDone, locked: false,
      todo: account?.expired ? "Your LinkedIn access ended. Reconnect so posts can go out." : "Poxeet publishes the posts you approve to your profile. The other steps unlock after this.",
      doneText: account?.name ? `Connected as ${account.name}.` : "Connected.", href: "/app/settings/channels",
    },
    {
      id: "ai", title: "Add AI access", done: aiDone, locked: !linkedinDone,
      todo: member.setup.credits !== null
        ? "Poxeet credits (from $5), or your own Claude, OpenAI or DeepSeek key."
        : "Your own Claude, OpenAI or DeepSeek key, or the instance key from your admin.",
      doneText: member.setup.ownKey ? `Using your ${PROVIDERS[member.setup.ownKey.provider].label} key.`
        : member.setup.ai === "credits" ? `Using Poxeet credits: ${member.setup.credits} left.` : "Using the instance key from your admin.",
      href: linkedinDone ? "/app/settings/ai" : null,
    },
    {
      id: "import", title: "Teach Poxeet your voice", done: importDone, locked: !(linkedinDone && aiDone),
      todo: posts > 0
        ? `${posts} of ${MIN_VOICE_POSTS} posts added. Add ${more} more to finish.`
        : `Copy ${MIN_VOICE_POSTS} of your LinkedIn posts in, one at a time. ${GOOD_VOICE_POSTS}+ gives a sharper voice.`,
      doneText: `${posts} posts to learn from.${posts < GOOD_VOICE_POSTS ? ` ${GOOD_VOICE_POSTS}+ gives a sharper voice; add more any time.` : ""}`,
      href: linkedinDone && aiDone ? "/app/import" : null,
    },
  ];
  return { steps, done: steps.filter((step) => step.done).length, total: steps.length };
}

/** The step that has to be done before `id` can be used, or null when `id` is unlocked. */
export function blockingStep(member: Member, id: SetupStep["id"]) {
  const { steps } = setupSteps(member);
  const index = steps.findIndex((step) => step.id === id);
  return steps.slice(0, index).find((step) => !step.done) ?? null;
}
