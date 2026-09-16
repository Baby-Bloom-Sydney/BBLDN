// The unconfigured `areas` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// `areas.swap.test.ts` also has a "fails closed" test, but it installs a hand-written provider that *mirrors*
// the unconfigured one and then asserts that fake answered — so it proves nothing about `areas-registry.ts`.
// This file never calls `configureAreas`, so every call below runs against the real factory default: vitest
// isolates module state per file, which is the only way to reach that default from outside the module.
import { describe, expect, it } from "vitest";
import { areas } from "@/modules/areas";

const AREA = { area: "Clapham", district: "SW4" };

describe("areas before any configureAreas call — the real registry default", () => {
  it("refuses lookupArea with a coded error rather than answering from nowhere", async () => {
    const result = await areas.lookupArea("SW4");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "areas-not-configured",
    );
  });

  it("refuses centroid and distanceKm the same way", async () => {
    const centroid = await areas.centroid("SW4");
    const distance = await areas.distanceKm("SW4", "SW4");

    expect(!centroid.ok && centroid.error.details?.reason).toBe(
      "areas-not-configured",
    );
    expect(!distance.ok && distance.error.details?.reason).toBe(
      "areas-not-configured",
    );
  });

  // The documented quiet corner (README): 03 §6.2 gives these three no `Result`, so unconfigured they answer
  // the empty/negative value. Pinned here so a later change from `false` to `true` cannot pass silently.
  it("answers the three Result-less reads with the closed, not the open, value", async () => {
    expect(await areas.searchAreas("Clap")).toEqual([]);
    expect(await areas.listAll()).toEqual([]);
    expect(await areas.isInServiceArea(AREA.district)).toBe(false);
  });
});
