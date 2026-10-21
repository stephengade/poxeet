import { describe, expect, it } from "vitest";
import { aiPhrasesIn, withoutDashes, WRITING_RULES } from "../lib/ai/prompt";
import { DRAFTER_SYSTEM, parseDraft } from "../lib/plan/drafter";

// The shared writing rules (D-028): no em dashes, no stock AI phrasing, enforced in code as well as asked for.

describe("withoutDashes", () => {
  it("turns em and en dashes used as punctuation into commas", () => {
    expect(withoutDashes("We shipped it — and nobody noticed.")).toBe("We shipped it, and nobody noticed.");
    expect(withoutDashes("Fast–cheap–good")).toBe("Fast, cheap, good");
    expect(withoutDashes("— A note")).toBe("A note");
  });

  it("keeps number ranges and ordinary hyphens", () => {
    expect(withoutDashes("From 2024–2025, a well-known team")).toBe("From 2024-2025, a well-known team");
  });
});

describe("aiPhrasesIn", () => {
  it("finds stock AI phrasing, whatever the case or apostrophe", () => {
    expect(aiPhrasesIn("Let's DELVE into it. In today’s fast-paced world…")).toEqual(["delve", "in today's fast-paced"]);
    expect(aiPhrasesIn("We shipped one small thing every Friday.")).toEqual([]);
  });
});

describe("drafter rules", () => {
  const draft = (text: string) => JSON.stringify({ text, rationale: "Fits.", needs_user_input: null, flags: [] });

  it("gives the drafter the shared rules", () => {
    expect(DRAFTER_SYSTEM).toContain(WRITING_RULES);
  });

  it("sends a draft with AI phrases back once, then keeps it with a flag", () => {
    const text = "This is a game-changer for small teams, and here is a concrete reason why it matters to us.";
    const first = parseDraft(draft(text), false);
    expect(first.ok).toBe(false);
    expect(!first.ok && first.problem).toContain('"game-changer"');
    const last = parseDraft(draft(text), true);
    expect(last.ok && last.draft.flags).toEqual(["Check the wording: game-changer"]);
  });

  it("removes dashes from the post and its hook", () => {
    const parsed = parseDraft(JSON.stringify({ text: "Small releases — every week — beat big ones. We tried both for a year.", hook: "Small releases — every week", flags: [] }));
    expect(parsed.ok && parsed.draft.text).toBe("Small releases, every week, beat big ones. We tried both for a year.");
    expect(parsed.ok && parsed.draft.hook).toBe("Small releases, every week");
  });
});
