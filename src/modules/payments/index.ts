// payments connector (01 §2.5; 03 §5.2) — the app's one view of money and access: the two purchase paths, the
// completion spine, the access standing and the admin toggle. Owns the `LinkRef` (never the provider's id) and
// the `bundle.*` / `deposit.*` / `access.*` events. May import `purchase-paths` · `comms` (S) · `auth` (S) ·
// `platform` (S) — **never `access-gate`**: it emits events and sends `app-ready` instead (01 §2.3; fix: A-3).
export type * from "./types";

// The binding every caller uses, and the boot hook that fills it. Unconfigured, every method is
// `INTERNAL { reason: 'payments-not-configured' }` — never a silent success.
export { payments } from "./lib/default-payments";
export { configurePayments } from "./lib/configure-payments";
export { createPayments } from "./lib/create-payments";
export { stubPayments } from "./payments.stub";

// The five scheduled jobs beside the purchase methods (01 §4f). Same inside, same store, its own binding — a
// cron runs under the service role on a schedule, a purchase method under a session on a request.
export { paymentsJobs } from "./lib/default-payments-jobs";
export { configurePaymentsJobs } from "./lib/configure-payments-jobs";
export { createPaymentsJobs } from "./lib/create-payments-jobs";

// The three screens of 04 §6.2 and their server reads / actions (05 §7 rule 5 — the route files are thin).
export { BundlePage } from "./components/BundlePage";
export { BundleStatusPage } from "./components/BundleStatusPage";
export { SelfServePage } from "./components/SelfServePage";
export { loadMoneyPage } from "./lib/load-money-page";
export { moneyPageView } from "./lib/money-page-view";
export { startCheckoutAction } from "./actions/start-checkout-action";
export { openPortalAction } from "./actions/open-portal-action";

// The two stores the boot file chooses between (03 §11 row 4: swap either half).
export { dbSpineStore } from "./lib/db-spine-store";
export { memorySpineStore } from "./lib/memory-spine-store";
