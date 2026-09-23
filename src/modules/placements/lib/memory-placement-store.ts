// The in-memory `PlacementStore` — what the suites run the three L rows against. Replaced, never mutated.
// The store over `nanny_placements` (`0007`) is `src/boot/db-placement-store.ts`.
import { ok } from "@/modules/platform";
import type {
  ParentId,
  PlacementId,
  PlacementState,
  PositionId,
} from "@/modules/shared-types";
import type { PlacementRecord, PlacementStore } from "../types";

export function memoryPlacementStore(
  seed: ReadonlyArray<PlacementRecord> = [],
): PlacementStore {
  const holder = {
    current: new Map<PlacementId, PlacementRecord>(
      seed.map((row) => [row.placementId, Object.freeze(row)]),
    ),
  };
  const all = (): ReadonlyArray<PlacementRecord> => [
    ...holder.current.values(),
  ];

  return Object.freeze({
    get: async (placementId: PlacementId) =>
      ok(holder.current.get(placementId) ?? null),
    forPosition: async (positionId: PositionId) =>
      ok(Object.freeze(all().filter((row) => row.positionId === positionId))),
    forParent: async (parentId: ParentId) =>
      ok(Object.freeze(all().filter((row) => row.parentId === parentId))),
    forState: async (state: PlacementState) =>
      ok(Object.freeze(all().filter((row) => row.state === state))),
    put: async (record: PlacementRecord) => {
      holder.current = new Map([
        ...holder.current,
        [record.placementId, Object.freeze(record)],
      ]);
      return ok(undefined);
    },
  });
}
