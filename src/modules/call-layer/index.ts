// call-layer connector (01 §2.5; 03 §2.7) — the call page, slot picker and call state for all three call types
// (`00-glossary` §1.3). It is the **only** module besides `admin` / `admin-on-behalf` that may import
// `scheduling` (R3), and it reaches `positions` through the stage-model connector alone (fix: A-2 / R2).
// May import `positions` · `scheduling` · `comms` (S) · `auth` (S) · `platform` (S).
export type * from "./types";

// The connector (03 §2.7).
export { callLayer } from "./lib/default-call-layer";
export { configureCallLayer } from "./lib/configure-call-layer";

// The inside (1d): the orchestrator over `scheduling` + `advance`, the C-row slice, the mirror store port.
export { createCallLayer } from "./lib/create-call-layer";
export { createCallLayerSlice } from "./lib/create-call-layer-slice";
export { memoryCallMirrorStore } from "./lib/memory-call-mirror-store";
export { CALL_TRANSITIONS } from "./lib/call-transitions";

// The stage-model seam (03 §2.1) — the C rows register here, they are never imported by `positions`.
export { registerCallLayerSlice } from "./lib/register-call-layer-slice";

// The stub the swap tests point at while boot has not wired the inside.
export { stubCallLayer } from "./call-layer.stub";

// Words the rail and the page share (04 §7.1 row 3; 04 §8) — `positions.getJourneySteps` composes row 3 with these.
export { callRailLine } from "./lib/call-rail-line";
export { callPageView } from "./lib/call-page-view";
export { londonSlotWords } from "./lib/london-slot-words";
export { groupSlotsByDay } from "./lib/group-slots-by-day";
// The 14-day window both pickers ask for (ADR-076) — one definition, so S-N-02 cannot drift from S-P-02.
export { slotRange } from "./lib/slot-range";
export { RAIL_LABELS } from "./lib/rail-labels";

// S-P-01 · S-P-02 · S-P-03 — the reads the route files call and the screens they render (01 §2.5 "thin").
export { loadCallPage } from "./lib/load-call-page";
export { loadParentJourney } from "./lib/load-parent-journey";
export { holdSlotAction } from "./actions/hold-slot-action";
export { chooseSlotAction } from "./actions/choose-slot-action";
export { listSlotsAction } from "./actions/list-slots-action";
// S-N-02's two (`2g`): the calendar read and the one write, both reached only by a signed-in nanny.
export { listNannySlotsAction } from "./actions/list-nanny-slots-action";
export { bookNannyCallAction } from "./actions/book-nanny-call-action";
export { CallPage } from "./components/CallPage";
export { CallUnavailable } from "./components/CallUnavailable";
export { SlotPicker } from "./components/SlotPicker";
export { ParentJourneyRail } from "./components/ParentJourneyRail";
