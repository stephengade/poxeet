import { PageHead } from "../../../../components/preview/parts";
import { SetupList } from "../../../../components/workroom/setup-list";
import { Button, Icon } from "../../../../components/ui";
import { getMember, setupSteps } from "../../../../lib/member";

export default async function SetupPage() {
  const member = await getMember();
  const { steps, done, total } = setupSteps(member);
  const current = steps.find((step) => !step.done);
  const imported = member.setup.importedPosts;

  return (
    <div className="wr-page">
      <PageHead
        title={current ? "Get set up" : "You're set up"}
        sub={current ? `${done} of ${total} done. One step at a time; each unlocks the next. Nothing posts until you approve it.` : "Plan your first month whenever you're ready."}
      />
      <div className="wr-split">
        <SetupList steps={steps} />
        <div className="wr-split-main wr-stack">
          {current && (
            <div className="wr-card wr-stack">
              <div>
                <p className="wr-small wr-muted" style={{ margin: 0 }}>Step {steps.indexOf(current) + 1} of {total}</p>
                <h2 className="wr-h2">{current.title}</h2>
                <p className="wr-sub wr-small">{current.todo}</p>
              </div>
              {current.href && <div className="wr-actions"><Button href={current.href} iconRight="arrow-right">Start</Button></div>}
            </div>
          )}
          {steps.filter((step) => step.locked && !step.done).map((step) => (
            <div key={step.id} className="wr-card wr-inline wr-muted">
              <Icon name="lock" size={14} />
              <span><strong>{step.title}</strong> unlocks after {steps[steps.indexOf(step) - 1].title.toLowerCase()}.</span>
            </div>
          ))}
          {imported > 0 && (
            <div className="wr-card wr-stack">
              <div>
                <h2 className="wr-h2">Your posts</h2>
                <p className="wr-sub wr-small">{imported === 1 ? "1 post for Poxeet to learn from." : `${imported} posts for Poxeet to learn from.`} Add more any time; nothing is removed.</p>
              </div>
              <div className="wr-actions"><Button variant="secondary" href="/app/import">Add more posts</Button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
