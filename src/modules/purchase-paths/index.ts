// purchase-paths connector (01 §2.5; 03 §5.2) — the **swappable** provider seam behind `payments`: payment link,
// self-serve checkout, plan shape (ADR-024 / ADR-068). Holds no state; never imports `comms` and never a business
// module (03 §5.5). May import `config` · `shared-types` · `platform` only.
//
// `stub-stripe` is deliberately **not** re-exported here. It is reached only by the guarded dynamic import in
// `src/instrumentation.ts`, so importing this connector can never pull stub code into a bundle (07 §5.5 layer 1).
export type * from "./types";

// The binding `payments` calls, and the boot hook that fills it. Unconfigured, every method is
// `INTERNAL { reason: 'provider-not-configured' }` — never a silent success (07 §5.5).
export { purchaseProvider } from "./lib/default-purchase-provider";
export { configurePurchaseProvider } from "./lib/configure-purchase-provider";
