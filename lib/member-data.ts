import type { SupabaseClient } from "@supabase/supabase-js";
import { fromBytea, unseal } from "./crypto";
import { linkedInConfig, revokeToken } from "./linkedin";
import { createAdminClient } from "./supabase/admin";

// Settings → Your data (D-030): a member's export, and deleting their data while keeping the account. Server only.

/** The tables "Delete my data" empties for the member (delete_member_data), plus profiles.brief, which it clears. */
export const DELETED_TABLES = ["scheduled_posts", "calendars", "voice_profiles", "voice_jobs", "imported_posts", "linkedin_connections"] as const;

const COLUMNS = {
  imported_posts: "id, source, text, posted_at, url, created_at",
  voice_profiles: "version, origin, is_active, source_post_count, profile, created_at",
  calendars: "id, start_date, days, posts_per_week, pillars, status, plan, timezone, created_at",
  scheduled_posts: "id, calendar_id, channel, status, scheduled_at, pillar, post_type, topic_angle, hook, content, approved_at, posted_at, posted_via, linkedin_post_urn, created_at",
} as const;

type Row = Record<string, unknown>;

export type MemberExport = {
  format: "poxeet-export";
  version: 1;
  exported_at: string;
  account: { email: string; first_name: string | null; last_name: string | null; timezone: string; posting_slots: unknown };
  brief: unknown;
  imported_posts: Row[];
  voice_versions: Row[];
  calendars: Row[];
  scheduled_posts: Row[];
};

/** Puts the member's rows together as the export file's content. Pure, so the shape is tested directly. */
export function buildExport(input: { now: Date; profile: Row; importedPosts: Row[]; voiceVersions: Row[]; calendars: Row[]; scheduledPosts: Row[] }): MemberExport {
  const { profile } = input;
  return {
    format: "poxeet-export",
    version: 1,
    exported_at: input.now.toISOString(),
    account: {
      email: String(profile.email ?? ""),
      first_name: (profile.first_name as string | null) ?? null,
      last_name: (profile.last_name as string | null) ?? null,
      timezone: String(profile.timezone ?? "UTC"),
      posting_slots: profile.posting_slots ?? [],
    },
    brief: profile.brief ?? {},
    imported_posts: input.importedPosts,
    voice_versions: input.voiceVersions,
    calendars: input.calendars,
    scheduled_posts: input.scheduledPosts,
  };
}

/** Every row of one of the member's tables, a page at a time (PostgREST returns at most 1,000 rows per request). */
async function readAll(supabase: SupabaseClient, table: keyof typeof COLUMNS, userId: string, order: string) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const columns: string = COLUMNS[table];
    const { data, error } = await supabase.from(table).select(columns).eq("user_id", userId).order(order).range(from, from + 999);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) return rows;
  }
}

/** The member's export, read with their own session (RLS), so it can only ever hold their rows. */
export async function exportMemberData(supabase: SupabaseClient, userId: string, now = new Date()) {
  const [{ data: profile, error }, importedPosts, voiceVersions, calendars, scheduledPosts] = await Promise.all([
    supabase.from("profiles").select("email, first_name, last_name, timezone, posting_slots, brief").eq("id", userId).single(),
    readAll(supabase, "imported_posts", userId, "created_at"),
    readAll(supabase, "voice_profiles", userId, "version"),
    readAll(supabase, "calendars", userId, "created_at"),
    readAll(supabase, "scheduled_posts", userId, "scheduled_at"),
  ]);
  if (error || !profile) throw new Error(`Couldn't read the profile: ${error?.message ?? "missing"}`);
  return buildExport({ now, profile, importedPosts, voiceVersions, calendars, scheduledPosts });
}

/**
 * Deletes the member's data and keeps the account (delete_member_data, one transaction). The LinkedIn token is
 * revoked with LinkedIn first, best effort. Posts already on LinkedIn are never touched. Returns rows deleted per table.
 */
export async function deleteMemberData(userId: string): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("linkedin_connections").select("ciphertext, iv, tag").eq("user_id", userId).maybeSingle();
  const config = linkedInConfig();
  if (row && config) {
    try {
      const token = unseal({ ciphertext: fromBytea(row.ciphertext), iv: fromBytea(row.iv), tag: fromBytea(row.tag) });
      await revokeToken({ token, ...config });
    } catch { /* an unreadable token is deleted anyway */ }
  }
  const { data, error } = await admin.rpc("delete_member_data", { p_user: userId });
  if (error) throw new Error(`Couldn't delete the member's data: ${error.message}`);
  return data as Record<string, number>;
}
