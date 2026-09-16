// The K-row slice, stubbed (03 §11 test 1 — "with `call-layer` or `placements` stubbed, cascades hit the stub
// slice"). Each handler echoes the move back as a `StateAfter` and emits nothing: the preconditions, cascades and
// side effects of the 25 K rows are Phase 1f.
//
// The boot file registers these with `positions.registerSlice` — `connections` may not import `positions`
// (01 §2.3), which is the whole point of registration being handed in rather than reached for.
import { ok } from "@/modules/platform";
import type {
  AdvanceInput,
  ConnectionStage,
  Instant,
  TransitionId,
} from "@/modules/shared-types";
import type { ConnectionsSlice } from "../types";

export function stubConnectionsSlice(
  ids: ReadonlyArray<TransitionId>,
  landsOn: ConnectionStage,
  at: Instant,
): ConnectionsSlice {
  return Object.freeze(
    ids.map((id) => ({
      id,
      run: async (input: AdvanceInput<TransitionId>) =>
        ok({
          entity: input.entity,
          stage: landsOn,
          version: 1,
          changedAt: at,
          cascaded: Object.freeze([]),
          events: Object.freeze([]),
        }),
    })),
  );
}
