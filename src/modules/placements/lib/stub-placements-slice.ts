// The L-row slice, stubbed (03 §11 test 1 — "with `call-layer` or `placements` stubbed, cascades hit the stub
// slice"). Each handler echoes the move back and emits nothing: L-1's atomic cascade, L-1b's
// `payments.openDfyAccess` and L-2's pointer clearing are Phase 1f.
import { ok } from "@/modules/platform";
import type {
  AdvanceInput,
  Instant,
  PlacementState,
  TransitionId,
} from "@/modules/shared-types";
import type { PlacementsSlice } from "../types";

export function stubPlacementsSlice(
  ids: ReadonlyArray<TransitionId>,
  landsOn: PlacementState,
  at: Instant,
): PlacementsSlice {
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
