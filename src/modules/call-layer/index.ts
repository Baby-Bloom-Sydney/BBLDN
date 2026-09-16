// call-layer connector (01 §2.5; 03 §2.7) — the call page, slot picker and call state for all three call types
// (`00-glossary` §1.3). It is the **only** module besides `admin` / `admin-on-behalf` that may import
// `scheduling` (R3), and it reaches `positions` through the stage-model connector alone (fix: A-2 / R2).
// May import `positions` · `scheduling` · `comms` (S) · `auth` (S) · `platform` (S).
export type * from "./types";

// The connector (03 §2.7).
export { callLayer } from "./lib/default-call-layer";
export { configureCallLayer } from "./lib/configure-call-layer";

// The stage-model seam (03 §2.1) — the C rows register here, they are never imported by `positions`.
export { registerCallLayerSlice } from "./lib/register-call-layer-slice";

// The stub the swap tests point at while the inside does not exist.
export { stubCallLayer } from "./call-layer.stub";
