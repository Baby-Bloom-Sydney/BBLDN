// The unconfigured `hire-docs` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// `hire-docs.swap.test.ts`'s "fails closed before boot configures a renderer" case calls `configureHireDocs`
// with a renderer that returns the `hire-docs-not-configured` error and then asserts it came back — a
// tautology that never touches `hire-docs-registry.ts`. This file never calls `configureHireDocs`; vitest
// isolates module state per file, so the call below runs against the real factory default.
//
// The claim under test is the registry's own: the hire summary is a legal artefact whose wording `04.20` still
// owes, so an unconfigured renderer must refuse rather than hand back a document a family would rely on.
import { describe, expect, it } from "vitest";
import { hireDocs } from "@/modules/hire-docs";

describe("hire-docs before any configureHireDocs call — the real registry default", () => {
  it("refuses renderHireSummary rather than returning a placeholder document", async () => {
    const result = await hireDocs.renderHireSummary({
      placementId: "placement-1",
      audience: "family",
    } as never);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "hire-docs-not-configured",
    );
  });
});
