// The in-memory `PositionStore` (1e) — the one the tests and the pre-schema boot use. Replaced, never mutated:
// every `put` swaps the frozen map for a new one, so a reader holding an old snapshot never sees a half write.
// The implementation over `nanny_positions` (migration `0006`) needs the marketplace tables and the RPC opener
// (ADR-127); it is recorded as owed in the `1e` PROGRESS entry.
import { ok } from "@/modules/platform";
import type { ParentId, PositionId } from "@/modules/shared-types";
import type { PositionRecord, PositionStore } from "../types";

/** 03 §2.2 / I-1 — the stages that count as a live position. */
const LIVE: ReadonlySet<string> = new Set([
  "DRAFT",
  "OPEN",
  "CONNECTING",
  "ACTIVE",
]);

export function memoryPositionStore(
  seed: ReadonlyArray<PositionRecord> = [],
): PositionStore {
  const holder = {
    current: new Map<PositionId, PositionRecord>(
      seed.map((record) => [record.positionId, Object.freeze(record)]),
    ),
  };

  const forParent = (parentId: ParentId): ReadonlyArray<PositionRecord> =>
    [...holder.current.values()].filter(
      (record) => record.parentId === parentId,
    );

  return Object.freeze({
    get: async (positionId: PositionId) =>
      ok(holder.current.get(positionId) ?? null),
    liveForParent: async (parentId: ParentId) =>
      ok(forParent(parentId).find((record) => LIVE.has(record.stage)) ?? null),
    listForParent: async (parentId: ParentId) => ok(forParent(parentId)),
    put: async (record: PositionRecord) => {
      holder.current = new Map([
        ...holder.current,
        [record.positionId, Object.freeze(record)],
      ]);
      return ok(undefined);
    },
  });
}
