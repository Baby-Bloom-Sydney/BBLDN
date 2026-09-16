// access-gate connector (01 §2.5; 03 §10.1) — family access to the app on payment / trial / placement (`06.17`).
// A derivation over `payments`, not a store of its own: it reads `getAccess` and re-exports `setAccess`. May
// import `payments` · `app` · `auth` (S) · `platform` (S) (01 §2.3). It sends nothing and emits nothing —
// `payments` owns the `access.*` events and the `app-ready` email (fix: A-3).
export type * from "./types";

export { accessGate } from "./lib/default-access-gate";
export { decideAccess } from "./lib/decide-access";
export { stubAccessGate } from "./access-gate.stub";
