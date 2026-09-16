// The unconfigured `positions` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// `positions.swap.test.ts` has no fail-closed case at all, and the sibling modules' cases install a fake that
// *mirrors* the unconfigured object rather than reaching it. This file never calls `configurePositions`, so
// every call below runs against the real `POSITIONS_REGISTRY` default — vitest isolates module state per file,
// which is the only way to reach that default from outside the module.
import { describe, expect, it } from "vitest";
import { positions } from "@/modules/positions";
import type { EntityRef } from "@/modules/positions";
import type { ParentId, PositionId } from "@/modules/shared-types";

const ENTITY: EntityRef = { kind: "position", id: "position-1" as PositionId };

describe("positions before any configurePositions call — the real registry default", () => {
  it("refuses getStage rather than inventing a stage", async () => {
    const result = await positions.getStage(ENTITY);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "positions-not-configured",
    );
  });

  it("refuses getJourneySteps rather than putting an invented journey on a dashboard", async () => {
    const result = await positions.getJourneySteps("parent-1" as ParentId);

    expect(!result.ok && result.error.details?.reason).toBe(
      "positions-not-configured",
    );
  });

  it("refuses getForMatching and recordPrecheck the same way", async () => {
    const read = await positions.getForMatching("position-1" as PositionId);
    const write = await positions.recordPrecheck(
      "position-1" as PositionId,
      {
        firedAt: "2026-01-01T00:00:00+00:00" as never,
        nannyIds: [],
      } as never,
    );

    expect(!read.ok && read.error.details?.reason).toBe(
      "positions-not-configured",
    );
    expect(!write.ok && write.error.details?.reason).toBe(
      "positions-not-configured",
    );
  });

  // 03 §2.5 gives `listAllowed` no `Result`, so unconfigured it answers "no levers" — a button that is absent,
  // never a button that moves a stage nothing is behind. Pinned so it cannot quietly become a populated list.
  it("offers no levers from listAllowed rather than levers nothing is behind", async () => {
    const levers = await positions.listAllowed(ENTITY, {
      kind: "admin",
      id: "admin-1" as never,
    });

    expect(levers).toEqual([]);
  });
});
