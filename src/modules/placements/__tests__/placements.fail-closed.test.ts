// The unconfigured `placements` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// `placements.swap.test.ts` configures the stub in `beforeEach` and so never reaches the real registry default.
// This file never calls `configurePlacements`; vitest isolates module state per file, so the call below runs
// against `PLACEMENTS_REGISTRY`'s factory default.
//
// Why it matters here specifically: this read is the evidence for invariant I-3 (03 §2.6, one live placement
// per position). An unconfigured binding that answered "no placement" would let a second placement onto a
// position that already has one — the registry's comment says exactly this, and nothing asserted it.
import { describe, expect, it } from "vitest";
import { placements } from "@/modules/placements";
import type { PositionId } from "@/modules/shared-types";

describe("placements before any configurePlacements call — the real registry default", () => {
  it("refuses activeForPosition rather than answering 'no placement' from nowhere", async () => {
    const result = await placements.activeForPosition(
      "position-1" as PositionId,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "placements-not-configured",
    );
  });
});
