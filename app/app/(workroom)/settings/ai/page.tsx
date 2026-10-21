import { SettingsHead } from "../../../../../components/workroom/settings-head";
import { creditsAvailable } from "../../../../../lib/ai/server";
import { starterCredits } from "../../../../../lib/billing/config";
import { hasEverHadCredits, listPacks } from "../../../../../lib/billing/credits";
import { packsIn, pricingCurrency } from "../../../../../lib/billing/region";
import { weeklyCost, weeksLeft } from "../../../../../lib/billing/rates";
import { LockedStep } from "../../../../../components/workroom/setup-list";
import { appUrl } from "../../../../../lib/config";
import { MIN_VOICE_POSTS } from "../../../../../lib/import/posts";
import { blockingStep, getMember } from "../../../../../lib/member";
import { AccessChoice } from "./access-choice";
import { KeyForm } from "./key-form";

export default async function AiSettings() {
  const member = await getMember();
  const blocker = blockingStep(member, "ai");
  if (blocker) {
    return (
      <>
        <SettingsHead title="AI access">The AI that analyses your voice and writes your drafts.</SettingsHead>
        <LockedStep title="AI access" blocker={blocker} />
      </>
    );
  }

  const next = member.setup.importedPosts < MIN_VOICE_POSTS ? { label: "Teach Poxeet your voice", href: "/app/import" } : null;
  const keyForm = <KeyForm saved={member.setup.ownKey} next={next} />;
  const credits = creditsAvailable() && member.setup.ai !== "instance_key";
  const [allPacks, hadCredits, currency] = credits ? await Promise.all([listPacks(), hasEverHadCredits(member.id), pricingCurrency()]) : [[], true, "USD" as const];
  const packs = packsIn(allPacks, currency);
  const starter = hadCredits ? 0 : starterCredits();

  return (
    <>
      <SettingsHead title="AI access">
        The AI that analyses your voice and writes your drafts.{" "}
        {credits ? "Use Poxeet credits, or your own key." : "Use your own key, or the instance key if your admin granted it."}
      </SettingsHead>
      {member.setup.ai === "instance_key" && (
        <section className="wr-card wr-settings-card">
          <div className="wr-settings-card-head">
            <h3 className="wr-h2">Using the instance key</h3>
            <p className="wr-sub wr-small">
              Your admin gave you access to their shared key. Add your own below to use your account instead; your own key always comes first.
            </p>
          </div>
        </section>
      )}
      {member.setup.ai === "instance_key" || !creditsAvailable() ? keyForm : (
        <AccessChoice
          initial={member.setup.ai === "own_key" ? "own_key" : "credits"}
          balance={member.setup.credits ?? 0}
          weeks={weeksLeft(member.setup.credits ?? 0)}
          weeklyCost={weeklyCost()}
          returnTo={appUrl()}
          starter={starter}
          packs={packs}
          keyForm={keyForm}
          next={next}
        />
      )}
    </>
  );
}
