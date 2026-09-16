// The unconfigured `scoring` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// `scoring.swap.test.ts`'s "fails closed" case installs a hand-written engine that *returns* the
// `scoring-not-configured` error and then asserts it came back — so it proves the fake, not
// `scoring-registry.ts`. This file never calls `configureScoring`; vitest isolates module state per file, so
// every call below runs against the real factory default.
//
// The arguments are shaped only enough to type-check: an unconfigured engine must refuse before it reads them,
// and that is part of what is being asserted.
import { describe, expect, it } from "vitest";
import { scoring } from "@/modules/scoring";

const POSITION = {
  area: { area: "Clapham", district: "SW4" },
  schedule: null,
  requirements: {},
} as never;

describe("scoring before any configureScoring call — the real registry default", () => {
  it("refuses scorePosition rather than returning a made-up score", async () => {
    const result = await scoring.scorePosition(POSITION, []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "scoring-not-configured",
    );
  });

  it("refuses all four engine functions, not only the one the swap test happens to call", async () => {
    const results = await Promise.all([
      scoring.scorePosition(POSITION, []),
      scoring.quickMatch(null, { area: "Clapham", district: "SW4" }, []),
      scoring.preAuthMatch({} as never, []),
      scoring.topN(POSITION, [], 5),
    ]);

    for (const result of results) {
      expect(!result.ok && result.error.details?.reason).toBe(
        "scoring-not-configured",
      );
    }
  });
});
