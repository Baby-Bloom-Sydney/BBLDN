// The `connections` stub — the reads answered from an in-memory seed, so a caller (chiefly `positions`'
// `getForMatching`) can be built and tested before the connection tables exist. It holds no stage machine: the
// 25 K rows of 03 §2.4 are Phase 1f and reach the stage model as registered handlers, never through this object.
import { ok } from "@/modules/platform";
import type { NannyId, ParentId, PositionId } from "@/modules/shared-types";
import type { ConnectionsReads } from "./types";

export type StubConnectionsSeed = {
  readonly liveByParent?: Readonly<Record<string, ReadonlyArray<NannyId>>>;
  readonly liveCountByPosition?: Readonly<Record<string, number>>;
};

export function stubConnections(
  seed: StubConnectionsSeed = {},
): ConnectionsReads {
  return Object.freeze({
    liveNannyIdsForParent: async (parentId: ParentId) =>
      ok(seed.liveByParent?.[parentId] ?? Object.freeze([])),
    liveCountForPosition: async (positionId: PositionId) =>
      ok(seed.liveCountByPosition?.[positionId] ?? 0),
  });
}
