// ADR-172 — a safety instruction is never "parked legacy", and a deleted one cannot come back.
//
// `3d′` found `src/lib/legal/checkpoints.ts:147` telling a user she is a mandatory reporter under NSW law and to
// report a child at risk of significant harm to an Australian agency on an Australian number, reachable from the
// routed legacy `/apply` step. The ruling: the instruction is **deleted, not translated**; the page says nothing on
// the subject rather than something false; and the gate is extended so the string cannot return.
//
// Two claims, both executable here:
//   1. `check-config-literals` has a `safeguarding` rule that catches every duty, threshold, agency and hotline the
//      class is made of — Australian (what was deleted) *and* England-and-Wales (what must not be guessed at).
//      A gate nobody has driven is a claim, not a control (ADR-171's reason, applied again).
//   2. The rule runs **everywhere**, including inside `literal-exclusions.json`'s parked legacy tree, and the whole
//      scanned tree is clean of it. The parked tree may hold stale marketing; it may not hold a stale safety claim.
//
// **Why the England-and-Wales names are banned too, when the E&W route is exactly what we are missing.** A
// safeguarding duty, threshold, agency or hotline belongs in a *versioned legal document body* (`legal_documents`,
// seeded from SQL and reviewed by a solicitor — `3a`, FATE `10.39`/`10.40`), never hardcoded in a component, an
// email template or a PDF. The scan roots are `src` / `tests` / `scripts`, so `3a`'s ratified body is unaffected;
// what the rule forbids is a builder typing a reporting route into code, which is precisely how the NSW one shipped.
//
// Needles are assembled from fragments so this file does not itself carry what the gate greps for (the convention
// `config.legal.test.ts` and `config.repo.test.ts` already use).
import { describe, expect, it } from "vitest";
import {
  RULES,
  scanRepo,
} from "../../../../scripts/ci/check-config-literals.mjs";

type Rule = { rule: string; pattern: RegExp; everywhere?: boolean };

const safeguardingRule = (): Rule => {
  const rule = (RULES as Rule[]).find((entry) => entry.rule === "safeguarding");
  if (!rule)
    throw new Error("check-config-literals has no `safeguarding` rule");
  return rule;
};

/** What the deleted class is made of. Fragments join to the runtime needle; the source carries neither half whole. */
const FACTS: readonly (readonly [string, readonly string[]])[] = [
  // The duty, stated as a duty — the sentence that made `checkpoints.ts:147` a safeguarding instruction.
  ["the reporting duty", ["mandatory report", "er"]],
  ["the duty as an activity", ["mandatory report", "ing"]],
  ["the NSW parallel scheme", ["Reportable ", "Conduct"]],
  // The threshold.
  ["the NSW threshold, spelled out", ["Risk of Significant", " Harm"]],
  ["the NSW threshold, abbreviated", ["RO", "SH"]],
  // The Australian agencies.
  ["the NSW child-protection line", ["Child Protection ", "Helpline"]],
  ["the NSW department, abbreviated", ["DC", "J"]],
  [
    "the NSW department, spelled out",
    ["Department of Communities and", " Justice"],
  ],
  // The Australian hotlines.
  ["the NSW child-protection number", ["132", " 111"]],
  ["the AU children's helpline number", ["1800 55", " 1800"]],
  ["the AU emergency number, in an instruction", ["call ", "000 immediately"]],
  // England and Wales — never guessed at in code; it belongs in a reviewed document body.
  ["the E&W children's charity", ["NSP", "CC"]],
  ["the E&W children's helpline brand", ["Child", "line"]],
  ["the E&W statutory route", ["children's social", " care"]],
  ["the E&W emergency number, in an instruction", ["call ", "999 immediately"]],
];

/** Lines that must NOT redden, or the rule gets deleted within a week (ADR-171's lesson, applied again). */
const BENIGN: readonly string[] = [
  'certificates: ["CPR", "First Aid", "Child Protection"],',
  "const da = a.distanceKm ?? 999;",
  "// Upfront = one-off A$1,000 on subscription_started.",
  "<strong>For disputes under $10,000:</strong>",
  "// refuses 14.7 % of random uuids (2 944 / 20 000 measured 2026-09-17)",
  "a second copy of a safeguarding decision would be the bug",
  "endOfToday.setHours(23, 59, 59, 999);",
  '"We need your Service NSW screenshot to continue. Please upload it and try again."',
];

describe("ADR-172 — the safeguarding gate catches each fact the class is made of", () => {
  it.each(FACTS)("catches %s", (_label, fragments) => {
    expect(safeguardingRule().pattern.test(fragments.join(""))).toBe(true);
  });

  it.each(BENIGN.map((line) => [line] as const))(
    "does not fire on %s",
    (line) => {
      expect(safeguardingRule().pattern.test(line)).toBe(false);
    },
  );

  it("runs everywhere — the parked legacy tree is not exempt from a safety claim", () => {
    expect(safeguardingRule().everywhere).toBe(true);
  });
});

describe("ADR-172 — the class is gone from the whole scanned tree, parked legacy included", () => {
  it("finds no safeguarding duty, threshold, agency or hotline in any scanned file", () => {
    const hits = scanRepo().hits.filter((hit: string) =>
      /\[(?:[^\]]*, )?safeguarding(?:, |\])/.test(hit),
    );
    expect(hits).toEqual([]);
  });

  it("scans the parked legacy tree for it — a clean result must mean looked-at, not skipped", () => {
    // If the `everywhere` pass were dropped, this count would fall to the non-excluded tree and the suite above
    // would pass vacuously. The legacy tree is the majority of the repo; 400 is a floor, not a measurement.
    expect(scanRepo().everywhereFilesScanned).toBeGreaterThan(400);
  });
});
