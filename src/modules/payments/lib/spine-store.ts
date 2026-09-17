// The one seam between the money rules and the database: every read and write of the spine (02 §4.5
// `parent_subscriptions`), the idempotency ledger (`payment_events`) and the three money RPCs of 02 §7. The
// rules in `create-payments.ts` never see a driver, a table name or a scope — they see this. The real inside is
// `db-spine-store.ts` over `auth`'s data port; `memory-spine-store.ts` is the test double and the stub wiring.
//
// **Scope, stated once (01 §6.3).** The parent-facing reads run `session`-scoped, so RLS bounds them to the
// caller's own row (`parent_subscriptions_self_select`; an admin's read is widened by `_admin_select`). The
// webhook, the sweeps and the RPC writers run `service`-scoped — the caller is the provider or a cron, not a
// session — which the migration grants to `service_role` alone (I-M2 / I-M8 / I-M10: no client writes the spine).
import type { AppDatabase, DataScope } from "@/modules/auth";
import type {
  Email,
  FamilyId,
  Instant,
  Json,
  PlacementId,
  Result,
  TableRow,
  Uuid,
} from "@/modules/shared-types";

export type SpineRow = TableRow<AppDatabase, "parent_subscriptions">;
export type SpineInsert =
  AppDatabase["Tables"]["parent_subscriptions"]["Insert"];
export type SpinePatch =
  AppDatabase["Tables"]["parent_subscriptions"]["Update"];
export type PaymentEventPatch =
  AppDatabase["Tables"]["payment_events"]["Update"];

/**
 * One verified delivery, decided in TypeScript and applied in one transaction by `apply_payment_event`
 * (`0019`; ADR-127). The signature check, the family resolution and the transition table stay above this
 * seam — what crosses it is a decided patch, never a decision.
 *
 * `familyId: null` is a delivery we could not place (an unminted `LinkRef`, or an event type we do not
 * handle): the ledger row is still written, because an unrecorded delivery is the one thing the runbook
 * cannot reconcile from.
 */
export type PaymentDelivery = {
  readonly provider: string;
  readonly providerEventId: string;
  readonly eventType: string;
  readonly payload: Json;
  readonly receivedAt: Instant;
  readonly familyId?: FamilyId | null;
  readonly spinePatch?: SpinePatch | null;
  /** `PRICES.accessAgeYears` — a required-when-used number, never a literal (L4). */
  readonly accessAgeYears?: number | null;
};

/**
 * `apply_payment_event`'s three outcomes (02 R-11). A duplicate is an outcome, never an error: the replay
 * costs one statement and touches no money.
 */
export type ApplyEventOutcome =
  | { readonly outcome: "duplicate" }
  | { readonly outcome: "unresolved"; readonly eventId: Uuid | null }
  | {
      readonly outcome: "applied";
      readonly eventId: Uuid;
      readonly accessUntil: Instant | null;
    };

/** What `app-ready` / `bundle-payment-link` need of a family — the email and a first name, nothing else. */
export type FamilyContact = {
  readonly userId: Uuid;
  readonly email: Email | null;
  readonly firstName: string | null;
};

/** The two contract numbers ADR-100 caps the first-week discount on, read from the placement. */
export type PlacementTerms = {
  readonly weeklyHours: number | null;
  readonly hourlyRatePence: number | null;
};

export interface SpineStore {
  /** The family's one spine row, or `null` (I-M1). `session` for a parent-facing read, `service` for the spine. */
  readByFamily(
    familyId: FamilyId,
    scope: DataScope,
  ): Promise<Result<SpineRow | null>>;
  /** Service scope. The sweeps' input; filtered in memory (03 §1.4 has no predicate — recorded in the L-007 entry). */
  listSpine(): Promise<Result<ReadonlyArray<SpineRow>>>;
  insertSpine(row: SpineInsert): Promise<Result<SpineRow>>;
  updateSpine(id: Uuid, patch: SpinePatch): Promise<Result<SpineRow>>;
  /**
   * RPC `apply_payment_event` (`0019`; ADR-127) — the webhook's ledger insert, spine update and
   * `processed_at` stamp in **one** transaction. Idempotent on `(provider, provider_event_id)`: the
   * duplicate is an outcome, and a replay touches no money. Service scope; the caller is the provider.
   */
  applyEvent(delivery: PaymentDelivery): Promise<Result<ApplyEventOutcome>>;
  /**
   * The ledger row's `processed_at` for a delivery that needed **nothing** — an event type we do not handle,
   * or a `LinkRef` we never minted. `apply_payment_event` cannot express "seen, and nothing to do": a null
   * family is `unresolved` there, which stamps `processing_error` and leaves the row on the runbook's
   * `processed_at IS NULL` index for ever. One statement, no money, and stated rather than hidden.
   */
  stampEvent(id: Uuid, patch: PaymentEventPatch): Promise<Result<void>>;
  /** RPC `start_family_trial_if_first` (02 §7) — the arguments come from `PRICES` / `FLAGS`, never a literal. */
  startTrial(
    familyId: FamilyId,
    trialDays: number,
    newTrialsEnabled: boolean,
  ): Promise<Result<SpineRow | null>>;
  /** RPC `open_dfy_access` (02 §7; ADR-093 / 094). */
  openDfyAccess(
    familyId: FamilyId,
    placementId: PlacementId,
    paymentAfterStartDays: number,
    satisfactionWindowDays: number,
  ): Promise<Result<SpineRow>>;
  /** RPC `set_access_window` (02 §7; ADR-083 / 084) — the one writer of `access_until`. */
  setAccessWindow(
    familyId: FamilyId,
    accessAgeYears: number,
  ): Promise<Result<Instant | null>>;
  familyContact(familyId: FamilyId): Promise<Result<FamilyContact | null>>;
  placementTerms(
    placementId: PlacementId,
  ): Promise<Result<PlacementTerms | null>>;
}
