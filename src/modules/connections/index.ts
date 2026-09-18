// connections connector (01 §2.5; 03 §2.2) — the connection stage model as a **slice** of `positions`: request,
// accept, meeting, outcome, and the branch stages of `00-glossary` §1.2. Its K-row handlers are registered with
// the stage model at boot and nothing outside calls a slice directly (03 §2.1). May import `placements` ·
// `comms` (S) · `auth` (S) · `platform` (S) — **not** `positions` (01 §2.3; the reverse edge is the cycle R2
// closed), so the boot file does the registering.
export type * from "./types";

// The stage vocabulary a caller reads a connection through (03 §2.2).
export type { ConnectionStage } from "@/modules/shared-types";

// The K-row slice the boot file hands to `positions.registerSlice` (03 §2.1).
export { stubConnectionsSlice } from "./lib/stub-connections-slice";

// The inside (`1g`): the 25 K rows over the store port, the two reads, and the §2.4 connection table.
export { createConnectionsSlice } from "./lib/create-connections-slice";
export { createConnections } from "./lib/create-connections";
export { memoryConnectionStore } from "./lib/memory-connection-store";
export { connectionsSliceRegistration } from "./lib/register-connections-slice";
export { CONNECTION_TRANSITIONS } from "./lib/connection-transitions";
export { LIVE_STAGES } from "./lib/live-stages";
/** H-12 — the stages K-24 may be cascaded onto; `positions` reads it so P-7 never fans out into a refusal. */
export { CANCELLABLE_STAGES } from "./lib/cancellable-stages";

// The reads `positions` calls (03 §7.5).
export { connections } from "./lib/default-connections";
export { configureConnections } from "./lib/configure-connections";
export { stubConnections } from "./connections.stub";

// `04.12` — S-P-07's in-app Connect (K-1, cascading into C-c) and the dispatcher boot parks for it.
export { connectToNannyAction } from "./actions/connect-to-nanny-action";
export { configureConnectionsDispatch } from "./lib/configure-connections-dispatch";
export { CONNECTIONS_PATHS } from "./lib/connections-paths";

// S-P-08 — the read the route calls and the list it renders (01 §2.5 "thin").
export { loadParentConnections } from "./lib/load-parent-connections";
export { connectionCardView } from "./lib/connection-card-view";
// ★ ADR-158 (2) — the one place the silent hold is enforced on the read side. Every **parent-facing** consumer
// of `forParent` passes its rows through this; the machinery deliberately does not (see the file's header).
export { visibleToParent } from "./lib/visible-to-parent";
export { ParentConnections } from "./components/ParentConnections";
