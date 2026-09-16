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

<!-- audit
Last edited: 2026-09-16T15:40+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the connector, the fail-closed registry, `stub-stripe` and its three guards. Recorded
gaps: no `stripe-uk` provider; `constantTimeEquals` is duplicated in the route layer because `platform` is
outside this unit's touch surface.
-->
