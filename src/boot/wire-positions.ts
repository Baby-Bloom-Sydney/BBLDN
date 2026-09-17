// `positions` (03 §2.5) — the aggregate root of the stage model. `1e` built both halves and wired neither: the
// reads (`configurePositions`) and the P-row slice (`registerPositionsSlice`) are two calls over **one store
// instance**, exactly as `wire-call-layer.ts` does for the C rows, because two stores would let `advance` write
// one position and `getStage` read another.
//
// The inside is real; the **store** is not. `memoryPositionStore` is per instance and forgets every position on
// a cold start — on a serverless runtime that is a family whose position silently ceases to exist, not a stub
// that refuses. So the same rule `wire-scheduling.ts` and `wire-call-layer.ts` apply: installed **outside
// production only**, chosen by the resolved environment (05 §3 rule 1), and production stays on the fail-closed
// `positions-not-configured` default with its reason on the report. The store over `nanny_positions`
// (migration `0006`) is owed — recorded in the `1e` PROGRESS entry and repeated here.
//
// `isInServiceArea` is P-2's own precondition (03 §6): a district that is not in the London table is a refusal,
// never a guess, because a guessed district matches the wrong nannies and the family finds out on the call. It
// is handed in rather than imported inside the module so the answer follows whatever provider `wireAreas` chose
// — which is why this runs after it. `JourneyRowSource` (rail row 3, composed by `call-layer`) is deliberately
// left unpassed: `1e` recorded it as open, and a row invented here would be a step on a parent's dashboard that
// nothing stands behind.
import { areas, normaliseDistrict } from "@/modules/areas";
import type { Environment } from "@/modules/config";
import {
  configurePositions,
  createPositions,
  createPositionsSlice,
  memoryPositionStore,
  registerPositionsSlice,
} from "@/modules/positions";
import type { PortWiring } from "./types";

const MEMORY_STORE =
  "the position store is memoryPositionStore — per instance, and it forgets every position on a cold start; the store over nanny_positions (0006) needs the marketplace tables and the RPC opener (ADR-127), owed since 1e";

/** 03 §6.3 rule 1: anything that is not an outward code is not a district, so it is not in the table either. */
const isInServiceArea = async (district: string): Promise<boolean> => {
  const outward = normaliseDistrict(district);
  return outward === null ? false : areas.isInServiceArea(outward);
};

export function wirePositions(environment: Environment): PortWiring {
  if (environment === "production")
    return {
      port: "positions",
      binding: "unconfigured",
      reason: `${MEMORY_STORE}; refused in production because a cold start would drop a parent's open position silently — scheduling and call-layer are refused there for the same reason`,
    };
  const store = memoryPositionStore();
  configurePositions(createPositions({ store }));
  registerPositionsSlice(createPositionsSlice({ store, isInServiceArea }));
  return {
    port: "positions",
    binding: "create-positions + the P-row slice, over one memory store",
    reason: `${MEMORY_STORE}; preview and development only. Rail row 3 (JourneyRowSource) is not passed — 1e left it open and an invented row would be a dashboard step nothing stands behind`,
  };
}
