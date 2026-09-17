// `purchase-paths/providers/stub-stripe` connector (01 §2.5). It is deliberately **not** re-exported from the
// module's own `index.ts`, so importing `@/modules/purchase-paths` can never pull stub code into a bundle
// (07 §5.5 layer 1; `check:bundle-secrets` is the acceptance).
//
// **The loader is `src/boot/wire-purchase-paths.ts`** (`1h`). F-c could not write it: this folder reached
// `node:crypto` through its constant-time compare, and `src/instrumentation.ts` is built for the edge runtime
// too (`src/middleware.ts` makes one exist), so importing the stub from boot put a Node builtin in an edge
// bundle. The compare is pure arithmetic now — nothing under this folder touches a builtin — so the static
// import is safe in both runtimes. What keeps it that way: `check:bundle-secrets` asserts no client chunk names
// `stub-stripe`, and `src/__tests__/client-server-boundary.test.ts` walks the graph from every `"use client"`.
export type { StubStripeOptions } from "./stub-stripe";
export { stubStripe } from "./stub-stripe";
