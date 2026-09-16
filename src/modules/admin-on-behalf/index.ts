// admin-on-behalf connector (01 §2.5; 03 §10.1) — the admin levers of T-5.2 rows 3–8. The same transition an
// ordinary mover fires, with `actor.kind = 'admin'` and `onBehalfOf` on the event (P-1, ADR-001). It imports the
// modules it moves — `connections` · `placements` · `positions` · `call-layer` · `matching` · `app` ·
// `scheduling` · `auth` (S) · `platform` (S) — and none of them imports it (01 §2.2 reading; R2).
export type * from "./types";

export { adminOnBehalf } from "./lib/default-admin-on-behalf";
export { configureAdminOnBehalf } from "./lib/configure-admin-on-behalf";
export { stubAdminOnBehalf } from "./admin-on-behalf.stub";
