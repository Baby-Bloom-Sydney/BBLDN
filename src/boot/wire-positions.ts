// `positions` (03 §2.5) — the aggregate root of the stage model, and now the **real store**, in every
// environment (`P1-STORES`).
//
// What this file used to say, and why it no longer says it: `memoryPositionStore` is per instance and forgets
// every position on a cold start, so on a serverless runtime a family's open position would silently cease to
// exist. That is a loss rather than a refusal, which is why `positions` was installed outside production only
// and why production answered `positions-not-configured`. `dbPositionStore` puts the position where `0006`
// always kept it — `nanny_positions` with its roster in `position_schedule` — so the reason for the refusal is
// gone, and with it the refusal. `wire-scheduling.ts` and `wire-call-layer.ts` made the same move for the same
// reason, one and two units earlier.
//
// It also closes the seam `1g` pinned: `call-layer`'s mirror, `connections` and `placements` are db stores, so
// while `positions` was in memory the two halves disagreed about where a position lives — `advance(P-2)` wrote
// to memory and the C-row mirror it cascades into looked in `nanny_positions`.
//
// The reads (`configurePositions`) and the P-row slice (`registerPositionsSlice`) are two calls over **one**
// store instance, exactly as `wire-call-layer.ts` does for the C rows: two stores would let `advance` write one
// position and `getStage` read another.
//
// `isInServiceArea` is P-2's own precondition (03 §6): a district that is not in the London table is a refusal,
// never a guess, because a guessed district matches the wrong nannies and the family finds out on the call. It
// is handed in rather than imported inside the module so the answer follows whatever provider `wireAreas` chose
// — which is why this runs after it. `JourneyRowSource` (rail row 3, composed by `call-layer`) is deliberately
// left unpassed: `1e` recorded it as open, and a row invented here would be a step on a parent's dashboard that
// nothing stands behind.
import { areas, normaliseDistrict } from "@/modules/areas";
import { auth } from "@/modules/auth";
import {
  configurePositions,
  configurePositionsJobs,
  createPositions,
  createPositionsJobs,
  createPositionsSlice,
  registerPositionsSlice,
} from "@/modules/positions";
import { dbPositionStore } from "./db-position-store";
import type { PortWiring } from "./types";

/**
 * ADR-127: every position write runs inside the caller's unit of work, and a unit of work admits one `rpc()` and
 * no table write — so until a `0019` definer writes `nanny_positions`, a committed position move is refused at
 * the port. Measured rather than asserted: `boot.test.ts` "what 0019 owes" pins it with the function's shape.
 */
const DEFINER_OWED =
  "the reads are live; a write inside a unit of work still needs the 0019 definer (ADR-127) — pinned in boot.test.ts, and the same gap sits under connections and placements";

/** 03 §6.3 rule 1: anything that is not an outward code is not a district, so it is not in the table either. */
const isInServiceArea = async (district: string): Promise<boolean> => {
  const outward = normaliseDistrict(district);
  return outward === null ? false : areas.isInServiceArea(outward);
};

export function wirePositions(): PortWiring {
  const store = dbPositionStore(auth.data);
  configurePositions(createPositions({ store }));
  registerPositionsSlice(createPositionsSlice({ store, isInServiceArea }));
  // `4d` — `close-no-candidates`, over the **same store instance** the reads and the slice use.
  configurePositionsJobs(createPositionsJobs({ store }));
  return {
    port: "positions",
    binding:
      "create-positions + the P-row slice + close-no-candidates (P-7), over one db position store",
    reason: `the position is nanny_positions (0006) with its roster in position_schedule, read back through the keyed read at service scope. No environment gate: a store over a real schema is real wherever a database is. ${DEFINER_OWED}`,
  };
}
