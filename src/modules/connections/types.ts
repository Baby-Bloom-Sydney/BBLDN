// connections — the module's type surface (01 §2.5). `connections` owns the connection stage model
// (`00-glossary` §1.2; 03 §2.2) as a **slice** of `positions`: its K-row handlers are registered with the stage
// model at boot and it is never called directly (03 §2.1). The stage vocabulary itself is `shared-types`' and is
// re-exported by `index.ts`.
import type {
  NannyId,
  ParentId,
  PositionId,
  Result,
  TransitionHandler,
} from "@/modules/shared-types";

/**
 * The K-row handlers the boot file registers with the stage model (03 §2.1). `TransitionHandler` is
 * `shared-types`' (03 §2.5; ADR-119) — `connections` has no arrow to `positions` (01 §2.3) and needs none: the
 * boot file, which may import both, hands these to `positions.registerSlice`.
 */
export type ConnectionsSlice = ReadonlyArray<TransitionHandler>;

export type ConnectionsErrorDetails = {
  readonly reason:
    | "E_ENTITY_NOT_FOUND"
    | "E_PRECONDITION_FAILED"
    | "E_TRANSITION_NOT_ALLOWED"
    | "connections-not-configured";
  readonly which?: string;
};

export type ConnectionsResult<T> = Result<T, ConnectionsErrorDetails>;

/**
 * The read `positions` calls to fill `activeConnectionWithFamily` on `getForMatching` (03 §7.5 — "comes on
 * `positions.getForMatching` (from the `connections` connector)").
 *
 * GAP — recorded in the L-005 F-a PROGRESS entry. 03 names the fact and names where it comes from, but no
 * section states this method's name or signature; this is the minimum that satisfies the sentence, and the
 * owning section (03 §7.5 / 01 §2.4) should confirm it.
 */
export type ConnectionsReads = {
  readonly liveNannyIdsForParent: (
    parentId: ParentId,
  ) => Promise<ConnectionsResult<ReadonlyArray<NannyId>>>;
  readonly liveCountForPosition: (
    positionId: PositionId,
  ) => Promise<ConnectionsResult<number>>;
};
