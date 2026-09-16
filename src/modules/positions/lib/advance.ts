// 03 §2.5 `advance` — the one way any stage moves, for positions, connections, placements and the call mirror.
//
// **This is the dispatch and nothing else.** The preconditions, cascades, invariants, idempotency and side
// effects of the 44 rows in 03 §2.4 belong to the slices (Phase 1e–1g); putting any of them here would make
// `positions` know the rules of a stage it does not own. What this file owns is the three things dispatch
// cannot delegate:
//
//   1. an unknown transition id is `VALIDATION { E_TRANSITION_UNKNOWN }` — the contract's own error;
//   2. a known id with no slice registered is a **boot** defect, not a caller's, so it is `INTERNAL` and says so
//      rather than returning a plausible-looking `CONFLICT`;
//   3. the slice runs inside one unit of work — the caller's when it passed one, otherwise one opened here, so
//      that "a stage never advances on a failed write" (01 §4a rule 5) holds for every caller.
import { err, withUnitOfWork } from "@/modules/platform";
import { TRANSITION_IDS } from "@/modules/shared-types";
import type {
  AdvanceInput,
  Result,
  StateAfter,
  TransitionId,
} from "@/modules/shared-types";
import { SLICE_REGISTRY } from "./slice-registry";

const KNOWN: ReadonlySet<string> = new Set(TRANSITION_IDS);

export async function advance<T extends TransitionId>(
  input: AdvanceInput<T>,
): Promise<Result<StateAfter>> {
  if (!KNOWN.has(input.transition)) {
    return err("VALIDATION", "Unknown transition", {
      reason: "E_TRANSITION_UNKNOWN" as const,
      transition: input.transition,
    });
  }

  const handler = SLICE_REGISTRY.handlerFor(input.transition);
  if (handler === undefined) {
    return err("INTERNAL", "No slice is registered for this transition", {
      reason: "E_SLICE_NOT_REGISTERED" as const,
      transition: input.transition,
      entity: input.entity.kind,
    });
  }

  const wide = input as AdvanceInput<TransitionId>;
  if (wide.uow !== undefined) return handler.run(wide, wide.uow);
  return withUnitOfWork((uow) => handler.run(wide, uow));
}
