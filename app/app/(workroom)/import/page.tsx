import { PageHead } from "../../../../components/preview/parts";
import { LockedStep } from "../../../../components/workroom/setup-list";
import { blockingStep, getMember } from "../../../../lib/member";
import { ExportImport } from "./import-flow";
import { VoicePosts } from "./voice-posts";

// Setup step 3, "Teach Poxeet your voice" (D-023): posts added one at a time first, the LinkedIn export as an option.
export default async function ImportPage() {
  const member = await getMember();
  const blocker = blockingStep(member, "import");
  return (
    <div className="wr-page">
      <PageHead title="Teach Poxeet your voice" sub="Poxeet learns how you write from your own posts. Only the posts you add here are read." />
      {blocker ? <LockedStep title="Teaching Poxeet your voice" blocker={blocker} /> : (
        <div className="wr-stack wr-voice-page">
          <VoicePosts userId={member.id} imported={member.setup.importedPosts} />
          <ExportImport />
        </div>
      )}
    </div>
  );
}
