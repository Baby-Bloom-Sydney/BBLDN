// `purchase-paths/providers/stub-stripe` connector (01 §2.5). It is deliberately **not** re-exported from the
// module's own `index.ts`, so importing `@/modules/purchase-paths` can never pull stub code into a bundle
// (07 §5.5 layer 1; `check:bundle-secrets` is the acceptance).
//
// **There is no loader yet.** `src/instrumentation.ts` does not call `configurePurchaseProvider` — reaching this
// folder from the boot file would place `node:crypto` in the edge instrumentation bundle (see that file's header
// for why). Until the boot file is runtime-split, the only importers are this module's own tests. Recorded in
// the L-005 F-c PROGRESS entry.
export type { StubStripeOptions } from "./stub-stripe";
export { stubStripe } from "./stub-stripe";
