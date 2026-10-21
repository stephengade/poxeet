import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./icon";

type Step = { title: ReactNode; description?: ReactNode; state?: "done" | "current" | "upcoming"; action?: ReactNode };

/** The onboarding checklist. Only the current step shows its action. */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn("pxt-stepper", className)}>
      {steps.map((step, index) => {
        const state = step.state ?? "upcoming";
        return (
          <li key={index} className="pxt-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="pxt-step-dot">{state === "done" ? <Icon name="check" size={14} strokeWidth={2.25} /> : index + 1}</span>
            <div>
              <p className="pxt-step-title">{step.title}{state === "done" && <span className="pxt-sr"> (done)</span>}</p>
              {step.description && <p className="pxt-step-desc">{step.description}</p>}
              {step.action && state === "current" && <div className="pxt-step-action">{step.action}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
