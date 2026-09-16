// The unconfigured `matching` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// `matching.swap.test.ts`'s "fails closed" case installs a hand-written `Matching` that returns the
// `matching-not-configured` error and asserts it came back — it proves the fake, not `matching-registry.ts`.
// This file never calls `configureMatching`; vitest isolates module state per file, so every call below runs
// against the real factory default.
import { describe, expect, it } from "vitest";
import { matching } from "@/modules/matching";
import type { PositionId } from "@/modules/shared-types";

const DISTRICT = { area: "Clapham", district: "SW4" };

describe("matching before any configureMatching call — the real registry default", () => {
  it("refuses quickMatch rather than showing a parent an empty result set as the true one", async () => {
    const result = await matching.quickMatch(null, DISTRICT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "matching-not-configured",
    );
  });

  // `autofire` is the one that writes a lever and sends a batch of emails, so its refusal is the load-bearing
  // one: an unconfigured binding must not report a blast it never sent.
  it("refuses autofire, resultsFor and preAuthMatch too", async () => {
    const results = await Promise.all([
      matching.autofire("position-1" as PositionId, {
        kind: "admin",
        id: "admin-1" as never,
      }),
      matching.resultsFor("position-1" as PositionId, {
        kind: "admin",
        id: "admin-1" as never,
      }),
      matching.preAuthMatch({} as never),
    ]);

    for (const result of results) {
      expect(!result.ok && result.error.details?.reason).toBe(
        "matching-not-configured",
      );
    }
  });
});
