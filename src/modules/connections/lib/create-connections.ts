// The two reads `positions` calls (03 §7.5), over the store port.
//
// Both are counts over one family's or one position's rows, and both feed a decision that must fail *narrow*
// rather than wide: `liveNannyIdsForParent` is the exclusion `scoring` applies (a nanny already in front of
// this family is not a new match), and `liveCountForPosition` is what I-2's "position `CONNECTING` ⇔ ≥ 1 live
// connection" is checked against. A read that answered "none" from nowhere would widen a candidate set that
// should have been narrowed, which is why the unconfigured default refuses instead.
import { ok } from "@/modules/platform";
import type {
  NannyId,
  ParentId,
  PositionId,
  Result,
} from "@/modules/shared-types";
import type {
  ConnectionsErrorDetails,
  ConnectionsReads,
  ConnectionsResult,
  ConnectionStore,
} from "../types";
import { LIVE_STAGES } from "./live-stages";

/**
 * The store promises the port's `AppErrorDetails`; the connector promises `ConnectionsErrorDetails`. Closing
 * the union any harder here would mean this module naming another module's failure reasons in its own type —
 * the reading `matching` recorded for `MatchingResult` and `1e` for `positions`.
 */
const asConnections = <T>(result: Result<T>): ConnectionsResult<T> =>
  result as Result<T, ConnectionsErrorDetails>;

export function createConnections(deps: {
  readonly store: ConnectionStore;
}): ConnectionsReads {
  return Object.freeze({
    liveNannyIdsForParent: async (
      parentId: ParentId,
    ): Promise<ConnectionsResult<ReadonlyArray<NannyId>>> => {
      const rows = await deps.store.forParent(parentId);
      if (!rows.ok) return asConnections(rows);
      const ids = rows.value
        .filter((row) => LIVE_STAGES.includes(row.stage))
        .map((row) => row.nannyId);
      // one nanny, one entry: a family can hold live rows on more than one position over time
      return ok(Object.freeze([...new Set<NannyId>(ids)]));
    },
    liveCountForPosition: async (
      positionId: PositionId,
    ): Promise<ConnectionsResult<number>> => {
      const rows = await deps.store.forPosition(positionId);
      if (!rows.ok) return asConnections(rows);
      return ok(
        rows.value.filter((row) => LIVE_STAGES.includes(row.stage)).length,
      );
    },
  });
}
