// The `placements` stub — the I-3 read answered from an in-memory seed, so `positions` and the admin surfaces can
// be built before the placement tables exist. No stage machine: the three L rows of 03 §2.4 are Phase 1f.
import { ok } from "@/modules/platform";
import type { PositionId } from "@/modules/shared-types";
import type { PlacementRead, PlacementsReads } from "./types";

export type StubPlacementsSeed = Readonly<Record<string, PlacementRead>>;

export function stubPlacements(seed: StubPlacementsSeed = {}): PlacementsReads {
  return Object.freeze({
    activeForPosition: async (positionId: PositionId) =>
      ok(seed[positionId] ?? null),
  });
}
