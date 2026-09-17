// The read `positions` calls for invariant I-3 (03 §2.6): the position's live placement, or none.
//
// "Live" here is "not `ENDED`", matching `0007`'s partial unique index `WHERE state <> 'ENDED'` — one
// definition, two enforcement points, neither inventing its own.
import { ok } from "@/modules/platform";
import type { PositionId, Result } from "@/modules/shared-types";
import type {
  PlacementRead,
  PlacementsErrorDetails,
  PlacementsReads,
  PlacementsResult,
  PlacementStore,
} from "../types";

const asPlacements = <T>(result: Result<T>): PlacementsResult<T> =>
  result as Result<T, PlacementsErrorDetails>;

export function createPlacements(deps: {
  readonly store: PlacementStore;
}): PlacementsReads {
  return Object.freeze({
    activeForPosition: async (
      positionId: PositionId,
    ): Promise<PlacementsResult<PlacementRead | null>> => {
      const rows = await deps.store.forPosition(positionId);
      if (!rows.ok) return asPlacements(rows);
      return ok(rows.value.find((row) => row.state !== "ENDED") ?? null);
    },
  });
}
