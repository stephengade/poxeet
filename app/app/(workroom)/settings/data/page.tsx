import { SettingsHead } from "../../../../../components/workroom/settings-head";
import { Button, Icon } from "../../../../../components/ui";
import { getMember } from "../../../../../lib/member";
import { createClient } from "../../../../../lib/supabase/server";
import { DeleteData } from "./delete-data";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function DataSettings() {
  const member = await getMember();
  const supabase = await createClient();
  const [{ data: latest }, { count: versions }, { count: posts }] = await Promise.all([
    supabase.from("imported_posts").select("created_at").eq("user_id", member.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("voice_profiles").select("id", { count: "exact", head: true }).eq("user_id", member.id),
    supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("user_id", member.id),
  ]);
  const imported = member.setup.importedPosts;
  const importLine = imported
    ? `${plural(imported, "post")} added, most recently on ${DATE.format(new Date(latest!.created_at))}. Add more after you've posted by hand, so your voice stays current.`
    : "No posts yet. Add a few of your LinkedIn posts so Poxeet can learn how you write.";
  const counts = { imported, versions: versions ?? 0, posts: posts ?? 0, linkedin: member.setup.linkedinAccount !== null };
  return (
    <>
      <SettingsHead title="Your data">Poxeet reads only what you add, and you can take it with you or delete it.</SettingsHead>
      <section className="wr-card wr-settings-card">
        <div className="wr-settings-card-head wr-settings-card-row">
          <div><h3 className="wr-h2">Your posts</h3><p className="wr-sub wr-small">{importLine}</p></div>
          <Button size="sm" variant="secondary" icon="upload" href="/app/import">{imported ? "Add more" : "Add posts"}</Button>
        </div>
      </section>
      <section className="wr-card wr-settings-card">
        <div className="wr-settings-card-head wr-settings-card-row">
          <div><h3 className="wr-h2">Export everything</h3><p className="wr-sub wr-small">Your posts, voice versions, brief, calendars and drafts as one JSON file.</p></div>
          {/* A plain link: the file comes from a route handler, which client-side navigation can't load. */}
          <a className="pxt-btn pxt-btn-secondary pxt-btn-sm" href="/app/settings/data/export" download><Icon name="doc" />Export</a>
        </div>
      </section>
      <DeleteData counts={counts} />
    </>
  );
}
