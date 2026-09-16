# payments

**What it does.** The app's one view of money and access (03 §5.2; ADR-024 / 068 / 085 / 093 / 094 / 097). Two
purchase paths, one spine — customer → record → access gate — so nothing downstream knows which path paid:

- **Done-for-you (paid).** The price is stated on the call and **nothing is charged on it**. A **£150 refundable
  deposit** is taken at cohort commitment and **opens no access** (ADR-097). The app switches on for family and
  nanny on the **nanny's first day** (`placements` calls `openDfyAccess` on L-1b) — a done-for-you family has
  **no trial** (ADR-093). The bill falls due **one week after the start**: fee − deposit − the nanny's first
  week's wages, the first-week discount being a discount on the bill and never a separate payment (ADR-094 /
  100). `balance-after-week-1` before `paymentDueAt` is `E_PAYMENT_NOT_DUE`.
- **Self-serve.** The 30-day trial from the first child, then `self-serve-app` on S-P-11 (ADR-091). Never
  displayed as free, never as an alternative to the done-for-you path (P-4, ADR-082).

Either way access runs until the youngest linked child turns 3, for all future children (ADR-083 / 084);
"lifetime" is never used. The admin can switch a family's access on or off at any time with a reason, and that
toggle **overrides every other standing** (ADR-093).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area        | Values                              | Types                                                                               |
| ----------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| The binding | `payments` · `configurePayments`    | `PurchasePath`                                                                      |
| Access      | —                                   | `AccessState` · `AccessStanding` · `AccessChange` · `DepositRecord` · `LapseReason` |
| Requests    | —                                   | `PaymentLink` · `TrialStart`                                                        |
| Errors      | —                                   | `PaymentsErrorReason` · `PaymentsErrorDetails` · `PaymentsResult`                   |
| The stub    | `stubPayments` (`payments.stub.ts`) | `StubPaymentsSeed`                                                                  |

**What it may import.** `purchase-paths` · `comms` (S) · `auth` (S) · `platform` (S) (01 §2.3; 03 §5.5).
**Never `access-gate`** — the edge runs the other way: `payments` emits `access.opened` / `access.toggled` /
`access.lapsed` and sends `app-ready`; `access-gate` reads `payments.getAccess` (fix: A-3 / R2).

**RLS scope (01 §6.3).** None yet — this unit writes no query. When the inside lands, the webhook spine writes
`payment_events` through `auth.data.run` with `scope: 'service'` (the caller is Stripe, not a session) and every
read of a family's standing runs session-scoped. That opt-out must be named here before the first query ships.

**Money is config, never a literal (L4).** Every amount comes from `PRICES` / `OFFER` (01 §3.1). There is no `£`,
no `GBP` amount and no price anywhere in this module; `prices()` renders the presets `config` states.

**What this module does _not_ do yet (F-c boundaries).** No inside: no Stripe SDK call, no key, no payout or
commission logic (N-2, ADR-022). The §5.4.3 webhook dispatch table, the `LinkRef` minting, the
`fee − deposit − first-week wages` computation, the lapse crons and the `payment_events` idempotency insert are
Phase 1 — the tables do not exist yet. `stubPayments` implements only rules the foundations **state** and returns
`ignored` for any verified event it cannot place, rather than guessing a money transition.

**Recorded gaps** (L-005 F-c PROGRESS entry): 03 §5.2 puts `Money` · `PlanShape` · `LinkKind` · `PricePreset` ·
`Price` · `PurchaseEvent` on `purchase-paths/index.ts` while `AccessState` and `PurchasePath` are `payments`' —
both are therefore module types, not `shared-types`, and `shared-types` is S5's file this shift; `prices()` can
render only the presets `PRICES` states an amount for (`deposit`, `self-serve-app`), because
`balance-after-week-1` and `custom` are per family.

**Suites.** `src/modules/payments/__tests__/payments.swap.test.ts` — the `payments` half of swap test 4 (03 §11).

<!-- audit
Last edited: 2026-09-16T15:55+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the connector, the fail-closed registry, `stubPayments` and the swap test.
-->
