// connections connector (01 §2.5; 03 §2.2) — the connection stage model as a **slice** of `positions`: request,
// accept, meeting, outcome, and the branch stages of `00-glossary` §1.2. Its K-row handlers are registered with
// the stage model at boot and nothing outside calls a slice directly (03 §2.1). May import `placements` ·
// `comms` (S) · `auth` (S) · `platform` (S) — **not** `positions` (01 §2.3; the reverse edge is the cycle R2
// closed), so the boot file does the registering.
export type * from "./types";

// The stage vocabulary a caller reads a connection through (03 §2.2).
export type { ConnectionStage } from "@/modules/shared-types";

// The K-row slice the boot file hands to `positions.registerSlice` (03 §2.1). Phase 1f writes the real handlers.
export { stubConnectionsSlice } from "./lib/stub-connections-slice";

// The reads `positions` calls (03 §7.5).
export { connections } from "./lib/default-connections";
export { configureConnections } from "./lib/configure-connections";
export { stubConnections } from "./connections.stub";
