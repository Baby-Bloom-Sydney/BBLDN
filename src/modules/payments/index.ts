// payments connector (01 §2.5; 03 §5.2) — the app's one view of money and access: the two purchase paths, the
// completion spine, the access standing and the admin toggle. Owns the `LinkRef` (never the provider's id) and
// the `bundle.*` / `deposit.*` / `access.*` events. May import `purchase-paths` · `comms` (S) · `auth` (S) ·
// `platform` (S) — **never `access-gate`**: it emits events and sends `app-ready` instead (01 §2.3; fix: A-3).
export type * from "./types";

// The binding every caller uses, and the boot hook that fills it. Unconfigured, every method is
// `INTERNAL { reason: 'payments-not-configured' }` — never a silent success.
export { payments } from "./lib/default-payments";
export { configurePayments } from "./lib/configure-payments";
export { stubPayments } from "./payments.stub";
