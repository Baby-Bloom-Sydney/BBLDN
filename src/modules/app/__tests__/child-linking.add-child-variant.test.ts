// Kickoff debt 14 — S-N-01's **active / passive variant** (04 §4.1 row 8; 04 §6.3 S-N-01 "active · passive").
//
// The under-3 signal is captured at N1 and never shown to her (04 §4.1 row 5). `2g` shipped the pitch with the
// active wording for everyone because `nannyAccountStore.get()` could not answer the signal; `2d` widened that
// read, and this is the copy that follows it.
//
// Two rules the suite holds:
//   1. **Active is the default.** An account with no signal — every account created before the funnel captured
//      it, and every invited nanny, who has no lead at all — reads the active wording. Absent is not "no".
//   2. **Neither variant is a gate.** The passive wording changes what the page *says*, never what it offers:
//      the form is the same form, because a nanny who works with older children may still know a family with a
//      baby, and a screen that refused her would be inventing a rule no document states.
//
// Written RED: there was one set of words and no variant at all.
import { describe, expect, it } from "vitest";
import { addChildPitchCopy } from "../child-linking/lib/add-child-pitch-copy";

describe("S-N-01 — the pitch's active / passive variant (kickoff debt 14)", () => {
  it("an unknown signal reads active — the planner's default", () => {
    expect(addChildPitchCopy(undefined)).toEqual(addChildPitchCopy(true));
  });

  it("the active wording speaks to a nanny who is with an under-three now", () => {
    const copy = addChildPitchCopy(true);

    expect(copy.variant).toBe("active");
    expect(copy.lead.toLowerCase()).toContain("already with a family");
  });

  it("the passive wording does not pretend she has a family to add today", () => {
    const copy = addChildPitchCopy(false);

    expect(copy.variant).toBe("passive");
    expect(copy.lead.toLowerCase()).not.toContain("already with a family");
    expect(copy.lead.length).toBeGreaterThan(0);
  });

  it("the heading is 04 §8's anchor in both variants — the pitch does not change, the framing does", () => {
    expect(addChildPitchCopy(true).heading).toBe(
      "Get paid for adding existing clients.",
    );
    expect(addChildPitchCopy(false).heading).toBe(
      addChildPitchCopy(true).heading,
    );
  });

  it("neither variant is a gate: the form's own words are the same on both", () => {
    expect(addChildPitchCopy(false).formHeading).toBe(
      addChildPitchCopy(true).formHeading,
    );
  });

  it("no banned word reaches either variant (glossary §8: job, $, Sydney, tracking)", () => {
    for (const signal of [true, false, undefined]) {
      const copy = addChildPitchCopy(signal);
      const words = `${copy.heading} ${copy.lead} ${copy.second} ${copy.formHeading}`;
      expect(words).not.toMatch(/\bjobs?\b|\$|Sydney|tracking/i);
    }
  });
});
