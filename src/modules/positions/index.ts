// positions connector (01 §2.5; 03 §2) — the aggregate root of the stage model. It owns `advance`, `amend`, the
// read models and the **slice-registration seam**: `connections`, `placements` and `call-layer` hand their
// `TransitionHandler`s in at boot and `advance` dispatches into them, so `positions` imports no `call-layer` and
// no `matching` (fix: A-1 / A-2 / R2). May import `connections` · `placements` · `comms` (S) · `areas` (S) ·
// `auth` (S) · `platform` (S).
export type * from "./types";

// The stage-model vocabulary is `shared-types`' (03 §2.5) and is exposed **here**, so a caller reads the stage
// model through `positions` rather than reaching for the type module.
export type {
  AdvanceInput,
  AmendableFields,
  AmendInput,
  CallOutcome,
  CallState,
  CallType,
  CloseReason,
  ConnectionStage,
  EndReason,
  EntityRef,
  JourneyStep,
  PayloadFor,
  PlacementState,
  PositionStage,
  RegisterSlice,
  SliceRegistration,
  Stage,
  StageRead,
  StateAfter,
  TransitionHandler,
  TransitionId,
  TransitionMover,
  TransitionSpec,
} from "@/modules/shared-types";

// The connector (03 §2.5).
export { advance } from "./lib/advance";
export { registerSlice } from "./lib/register-slice";
export { positions } from "./lib/default-positions";
export { configurePositions } from "./lib/configure-positions";

// The stub the contract names (03 §11 test 1 `stage-model.stub.ts`). The 44 rows of §2.4 are Phase 1e.
export { stubPositions } from "./positions.stub";
