// The `placements` stub — the I-3 read answered from an in-memory seed, so `positions` and the admin surfaces can
// be built before the placement tables exist. No stage machine: the three L rows of 03 §2.4 are `1g`'s.
import { ok } from "@/modules/platform";
import type { ParentId, PositionId } from "@/modules/shared-types";
import type { PlacementRead, PlacementsReads } from "./types";

/** Keyed by position id for `activeForPosition`; `1g` adds a parent-keyed half for `liveForParent`. */
export type StubPlacementsSeed = Readonly<Record<string, PlacementRead>>;

export function stubPlacements(
  seed: StubPlacementsSeed = {},
  byParent: Readonly<Record<string, PlacementRead>> = {},
): PlacementsReads {
  return Object.freeze({
    activeForPosition: async (positionId: PositionId) =>
      ok(seed[positionId] ?? null),
    liveForParent: async (parentId: ParentId) => ok(byParent[parentId] ?? null),
  });
}
