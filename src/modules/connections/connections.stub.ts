// The `connections` stub — the reads answered from an in-memory seed, so a caller (chiefly `positions`'
// `getForMatching`) can be built and tested before the connection tables exist. It holds no stage machine: the
// 25 K rows of 03 §2.4 are `1g`'s and reach the stage model as registered handlers, never through this object.
import { ok } from "@/modules/platform";
import type { NannyId, ParentId, PositionId } from "@/modules/shared-types";
import type { ConnectionsReads, ConnectionSummary } from "./types";

export type StubConnectionsSeed = {
  readonly liveByParent?: Readonly<Record<string, ReadonlyArray<NannyId>>>;
  readonly liveCountByPosition?: Readonly<Record<string, number>>;
  /** `1g` — the rail's rows 4 / 5 and S-P-08's list, seeded per parent. */
  readonly byParent?: Readonly<
    Record<string, ReadonlyArray<ConnectionSummary>>
  >;
};

export function stubConnections(
  seed: StubConnectionsSeed = {},
): ConnectionsReads {
  return Object.freeze({
    liveNannyIdsForParent: async (parentId: ParentId) =>
      ok(seed.liveByParent?.[parentId] ?? Object.freeze([])),
    liveCountForPosition: async (positionId: PositionId) =>
      ok(seed.liveCountByPosition?.[positionId] ?? 0),
    forParent: async (parentId: ParentId) =>
      ok(seed.byParent?.[parentId] ?? Object.freeze([])),
  });
}
