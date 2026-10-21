import { describe, expect, it } from "vitest";
import { buildExport, DELETED_TABLES } from "../lib/member-data";

// The Your data export's shape (D-030), without a database. Deletion is tested in member-data-db.test.ts.

describe("buildExport", () => {
  const profile = {
    email: "ann@example.test", first_name: "Ann", last_name: null, timezone: "Africa/Lagos",
    posting_slots: [{ day: "mon", time: "09:00" }], brief: { profession: "Engineer" },
  };

  it("puts every section in one versioned file", () => {
    const file = buildExport({
      now: new Date("2026-10-20T12:00:00Z"), profile,
      importedPosts: [{ id: "i1", text: "A post" }], voiceVersions: [{ version: 1 }, { version: 2 }],
      calendars: [{ id: "c1" }], scheduledPosts: [{ id: "s1", status: "draft" }],
    });
    expect(Object.keys(file)).toEqual(["format", "version", "exported_at", "account", "brief", "imported_posts", "voice_versions", "calendars", "scheduled_posts"]);
    expect(file).toMatchObject({
      format: "poxeet-export", version: 1, exported_at: "2026-10-20T12:00:00.000Z",
      account: { email: "ann@example.test", first_name: "Ann", last_name: null, timezone: "Africa/Lagos", posting_slots: [{ day: "mon", time: "09:00" }] },
      brief: { profession: "Engineer" },
    });
    expect(file.voice_versions).toHaveLength(2);
    expect(file.scheduled_posts).toEqual([{ id: "s1", status: "draft" }]);
  });

  it("fills an empty account with defaults", () => {
    const file = buildExport({ now: new Date(0), profile: { email: "b@example.test" }, importedPosts: [], voiceVersions: [], calendars: [], scheduledPosts: [] });
    expect(file.account).toEqual({ email: "b@example.test", first_name: null, last_name: null, timezone: "UTC", posting_slots: [] });
    expect(file.brief).toEqual({});
  });

  it("never carries secrets: no tokens or keys in the export", () => {
    const file = buildExport({ now: new Date(0), profile, importedPosts: [], voiceVersions: [], calendars: [], scheduledPosts: [] });
    expect(JSON.stringify(file)).not.toMatch(/ciphertext|token|api_key/);
  });
});

describe("DELETED_TABLES", () => {
  it("lists what Delete my data removes, and nothing about the account or billing", () => {
    expect([...DELETED_TABLES].sort()).toEqual(["calendars", "imported_posts", "linkedin_connections", "scheduled_posts", "voice_jobs", "voice_profiles"]);
  });
});
