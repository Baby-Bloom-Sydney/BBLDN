// `purchase-paths/providers/stub-stripe` connector (01 §2.5). Reached **only** through the guarded loader in
// `lib/resolve-purchase-provider.ts` — it is never re-exported from the module's own `index.ts`, so no client
// bundle and no production server path can reach the stub by importing `@/modules/purchase-paths` (07 §5.5).
export type { StubStripeOptions } from "./stub-stripe";
export { stubStripe } from "./stub-stripe";
