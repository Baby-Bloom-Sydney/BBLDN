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

// The stub the contract names (03 §11 test 1 `stage-model.stub.ts`).
export { stubPositions } from "./positions.stub";

// The inside (`1e`): the P-row slice over the store port, the reads, and the §2.4 position table.
export { createPositions } from "./lib/create-positions";
export { createPositionsSlice } from "./lib/create-positions-slice";
export { registerPositionsSlice } from "./lib/register-positions-slice";
export { memoryPositionStore } from "./lib/memory-position-store";
export { POSITION_TRANSITIONS } from "./lib/position-transitions";
export { journeySteps } from "./lib/journey-steps";

// S-P-05 — the read the route calls and the view it renders (01 §2.5 "thin").
export { loadPositionPage } from "./lib/load-position-page";
export { positionPageView } from "./lib/position-page-view";
export { PositionPage } from "./components/PositionPage";
export { closePositionAction } from "./actions/close-position-action";
