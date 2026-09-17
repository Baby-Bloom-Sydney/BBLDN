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
  PlacementId,
  Result,
  TableRow,
  Uuid,
} from "@/modules/shared-types";

export type SpineRow = TableRow<AppDatabase, "parent_subscriptions">;
export type SpineInsert = AppDatabase["Tables"]["parent_subscriptions"]["Insert"];
export type SpinePatch = AppDatabase["Tables"]["parent_subscriptions"]["Update"];
export type PaymentEventInsert =
  AppDatabase["Tables"]["payment_events"]["Insert"];
export type PaymentEventPatch =
  AppDatabase["Tables"]["payment_events"]["Update"];

/** `insertEvent` is the idempotency gate (02 R-11): a duplicate is an outcome, never an error. */
export type EventInsertOutcome =
  | { readonly kind: "inserted"; readonly id: Uuid }
  | { readonly kind: "duplicate" };

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
  /** Insert-before-dispatch on `(provider, provider_event_id)`; the unique violation is `duplicate`. */
  insertEvent(row: PaymentEventInsert): Promise<Result<EventInsertOutcome>>;
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
