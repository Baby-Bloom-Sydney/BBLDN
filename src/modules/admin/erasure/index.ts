// admin/erasure (07 §6.1; B-46) — the admin road for an Art 17 request that arrived by email. Two steps, two
// actions, and one read that shows no personal detail. Reached only through `@/modules/admin`.
export type * from "./types";
export { openErasureRequestAction } from "./actions/open-erasure-request-action";
export { runErasureRequestAction } from "./actions/run-erasure-request-action";
export { loadErasureRequests } from "./lib/load-erasure-requests";
