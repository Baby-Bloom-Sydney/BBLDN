# purchase-paths

**What it does.** The **swappable** payment provider behind `payments` (03 §5.2; ADR-024 / ADR-068). It turns a
request from `payments` into a provider URL, and a provider callback into a `PurchaseEvent`. It holds **no
state**, knows nothing about families, access, trials or refunds, and contains no price: every amount reaching it
was computed by `payments` from `PRICES` (L4 — 01 §3.2 rule 1).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area         | Values                                           | Types                                                                          |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| The binding  | `purchaseProvider` · `configurePurchaseProvider` | `PurchaseProvider`                                                             |
| The contract | —                                                | `Money` · `PlanShape` · `LinkKind` · `PricePreset` · `Price` · `PurchaseEvent` |
| Requests     | —                                                | `PurchaseCustomer` · `CheckoutReturnTo`                                        |
| Errors       | —                                                | `PurchasePathsErrorDetails` · `PurchaseResult`                                 |

**What it may import.** `config` · `shared-types` · `platform` (S) — never `comms`, never a business module
(03 §5.5; 01 §2.3).

**Fail-closed default.** The module-level `purchaseProvider` answers `INTERNAL { reason:
'provider-not-configured' }` on every method until `src/instrumentation.ts` calls `configurePurchaseProvider`.
That is deliberate: an unconfigured payment provider that answered `ok` would let the app behave as though money
had moved.

**`stub-stripe` and its three guards (07 §5.5; ADR-108).** Each is sufficient alone.

1. **Never reachable from this connector.** `index.ts` does not export the stub. The only path to it is the
   guarded dynamic `import()` in `src/instrumentation.ts`, taken only when `PURCHASE_PROVIDER = stub-stripe`, so
   no client chunk and no production server path can reach stub code (the `check:bundle-secrets` string scan is
   the acceptance).
2. **`assertStubAllowed` throws on construction** in a production-resolved environment — and `config`'s env
   schema independently refuses `PURCHASE_PROVIDER = stub-stripe` there (`config/lib/refine-env.ts`), which is
   what makes a production boot with the stub exit non-zero (`check:prod-guard`).
3. **`parseEvent` fails closed.** It accepts an event only when the caller presents `STUB_EVENT_SECRET`, compared
   in **constant time**, and only when the body satisfies `STUB_EVENT_SCHEMA`; anything else is `VALIDATION
{ reason: 'signature-invalid' }`. The route that calls it (`/api/dev/stub-purchase`) re-checks
   `auth.requireRole('admin')` and refuses to exist outside development / preview.

**What this module does _not_ do yet (F-c boundaries).** There is **no `stripe-uk` provider** — no Stripe SDK
call, no key, no payout logic (N-2, ADR-022). With `PURCHASE_PROVIDER = stripe-uk` the registry stays
unconfigured and every call fails closed; that is the honest state until the real provider lands with the Stripe
Dashboard objects. `prices()` (03 §5.2) lives on `payments`, not here, because the presets are config.

**Suites.** `src/modules/purchase-paths/__tests__/purchase-paths.swap.test.ts` — the `purchase-paths` half of
swap test 4 (03 §11): the fail-closed default, the stub's URLs and customer refs, and every way `parseEvent`
must refuse.

**Wired at boot since `1h`** (`src/boot/wire-purchase-paths.ts`). F-c could not wire it and said why: `stub-stripe` reached `node:crypto` through its constant-time compare, and `src/instrumentation.ts` is built for the edge runtime too (`src/middleware.ts` makes one exist), so importing the stub from the boot file put a Node builtin in an edge bundle — and `process.env.NEXT_RUNTIME`, the usual way to split a boot, is forbidden by `check:env-reads`. `1h` removed the reason rather than working around it: the compare is now pure integer arithmetic over a fixed 256-character window (see that file's header for what it guarantees and what it bounds), nothing under `providers/stub-stripe/` touches a Node builtin, and the static import is safe in both runtimes. `check:bundle-secrets` (no client chunk names `stub-stripe`) and `src/__tests__/client-server-boundary.test.ts` are what keep it that way.

**`stripe-uk` is still not built** (N-2, ADR-022: no account, no key, no payout logic on day one). Naming it in `PURCHASE_PROVIDER` leaves the registry on its fail-closed default **with the reason on the boot report** — never a silent fallback to the stub, which on a money seam would mean taking no money while reporting success.

<!-- audit
Last edited: 2026-09-17T20:10+10:00 — BB-LDN-Planner-070926/1h
Notes: the provider is wired at boot; `constantTimeEquals` rewritten from `node:crypto` to pure arithmetic, which
is what made that possible. `stub-stripe.guards.test.ts` re-proves the three 07 §5.5 layers and the compare's
properties (`security-reviewer` confirmed the rewrite sound: fixed iteration count, no length signal, no
false-equal input).
Prior: 2026-09-16T15:40+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the connector, the fail-closed registry, `stub-stripe` and its three guards. Recorded
gaps: no `stripe-uk` provider; `constantTimeEquals` is duplicated in the route layer because `platform` is
outside this unit's touch surface.
-->
