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

**The inside (`1h`).** `createPayments(deps)` composes five method groups over one `SpineStore`; `createPaymentsJobs(deps)` is the same inside on a cron's schedule, behind its own binding (`paymentsJobs` / `configurePaymentsJobs`), because a job runs under the service role and a purchase method under a session.

| Piece                     | File                                                                         | What it is                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The §5.4.3 dispatch table | `lib/dispatch-purchase-event.ts`                                             | **Pure.** (row, verified event, now) → the patch, the events, whether `app-ready` goes out, and whether anything happened at all. An event that does not fit the row it lands on is `ignored` with no state change — never a guessed transition. |
| The standing              | `lib/access-state-from-row.ts`                                               | A row → 03 §5.2's `AccessState`, in `family_access_reason()`'s own order (0010 §7), so the connector and the database gate can never disagree about a family. A window the crons have not swept reads as lapsed here.                            |
| The bill                  | `lib/balance-pence.ts` · `lib/first-week-wages-pence.ts`                     | fee − deposit − the nanny's contracted first week, capped at `OFFER.firstWeekMaxHours` × `OFFER.firstWeekMaxRatePence` (ADR-100). Never below zero: the first week is a **discount**, never a payment out.                                       |
| The five jobs             | `lib/sweep-targets.ts` (pure) + `lib/create-payments-jobs.ts` (the I/O)      | `expire-trials` · `trial-reminders` · `expire-past-due` · `expire-cancelled-subscriptions` · `payment-due-sweep`. Each selects on the state it moves a row out of, so a re-run is idempotent by construction.                                    |
| The seam                  | `lib/spine-store.ts` · `lib/db-spine-store.ts` · `lib/memory-spine-store.ts` | Every by-id read is a **keyed read** (ADR-131 (1)); the sweeps' whole-table read is the only scan left. The memory double mirrors the three RPCs of `0010` rule for rule.                                                                        |
| The screens               | `components/` + `lib/money-page-view.ts`                                     | S-P-10 / S-P-11 / S-P-12. Every word a parent reads is generated by the one pure view, which `payments.copy.test.ts` runs over all nine standings.                                                                                               |

**No unit of work on the webhook, and it is stated rather than hidden.** ADR-127 makes one RPC one transaction; the spine is a ledger **insert** then a spine **update**, which is two table writes. `payment_events.processed_at IS NULL` (0010 §2) is what the runbook reconciles from if a delivery lands between the two.

**What this module still does _not_ do.** No Stripe SDK call, no real key, no payout or commission logic (N-2, ADR-022) — `stripe-uk` is not built, and naming it leaves the provider registry fail-closed rather than falling back to the stub. No in-app cancellation (03 §5.2 names it; `PurchasePath` has no method for it — pinned `it.fails`). No `admin_notifications.payment_due` row from `payment-due-sweep` (AC-A-41; no module owns that table — pinned `it.fails`).

**Recorded gaps** (L-005 F-c PROGRESS entry): 03 §5.2 puts `Money` · `PlanShape` · `LinkKind` · `PricePreset` ·
`Price` · `PurchaseEvent` on `purchase-paths/index.ts` while `AccessState` and `PurchasePath` are `payments`' —
both are therefore module types, not `shared-types`, and `shared-types` is S5's file this shift; `prices()` can
render only the presets `PRICES` states an amount for (`deposit`, `self-serve-app`), because
`balance-after-week-1` and `custom` are per family.

**Suites.** `payments.swap.test.ts` (the `payments` half of swap test 4, 03 §11) · `payments.money.test.ts` · `payments.dispatch.test.ts` · `payments.inside.test.ts` · `payments.webhook.test.ts` · `payments.jobs.test.ts` · `payments.copy.test.ts` · `payments.screens.test.ts`. Two behaviours the documents state and this module does not do are pinned `it.fails` rather than dropped (see above).

<!-- audit
Last edited: 2026-09-17T20:10+10:00 — BB-LDN-Planner-070926/1h
Notes: the inside — the five method groups, the pure dispatch table, the spine store over the keyed read, the
five jobs behind their own binding, the three screens and their one pure view. `E_STORE` added to the error
vocabulary with its reason. Two documented behaviours pinned `it.fails`.
Prior: 2026-09-16T15:55+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the connector, the fail-closed registry, `stubPayments` and the swap test.
-->
