// payments — the app's view of money and access (03 §5.2). One spine: customer → record → access gate; nothing
// downstream knows which purchase path paid. `payments` owns the `LinkRef` (never the provider's id), the state
// model, the webhook idempotency and the `access.*` / `bundle.*` events. It **never imports `access-gate`** — it
// emits events and sends `app-ready` instead (01 §2.3; 03 §5.5; fix: A-3).
import type {
  LinkKind,
  Money,
  PlanShape,
  Price,
  PricePreset,
} from "@/modules/purchase-paths";
import type {
  Actor,
  AdminId,
  EventName,
  FamilyId,
  Instant,
  LinkRef,
  PlacementId,
  RawProviderEvent,
  Result,
  Url,
} from "@/modules/shared-types";

/** `PRICES.depositPence` at cohort commitment, refundable in the guarantee window, credited against the bill
 * (ADR-085 / 097). */
export type DepositRecord = {
  readonly paidAt: Instant;
  readonly pence: number;
  readonly refundedAt?: Instant;
};

/**
 * Why access is closed (03 §5.4.5). `paid-in-full` and `placed` lapse only on `accessUntil`: an unpaid
 * done-for-you family is never lapsed by a cron — non-payment is the admin's toggle, by hand (ADR-093 / 094).
 */
export type LapseReason =
  | "trial-ended"
  | "past-due"
  | "cancelled"
  | "access-ended";

/**
 * The standing a family's access is read through (03 §5.2). `accessUntil` is the youngest linked child's third
 * birthday, recomputed on every child link (ADR-083 / 084), and `null` until a child is linked.
 */
export type AccessStanding =
  | { readonly state: "none" }
  /** Deposit taken — **no access** (ADR-097). */
  | {
      readonly state: "deposit-paid";
      readonly depositPaidAt: Instant;
      readonly pence: number;
    }
  /** Done-for-you: the app is on from the nanny's first day; the bill falls due a week later (ADR-093 / 094). */
  | {
      readonly state: "placed";
      readonly accessUntil: Instant | null;
      readonly startedAt: Instant;
      readonly paymentDueAt: Instant;
      readonly balance: Money;
      readonly firstWeekWages: Money;
      readonly satisfactionWindowEndsAt: Instant;
      readonly linkSentAt?: Instant;
    }
  /** Self-serve only — a done-for-you family never sees a trial (ADR-093). */
  | {
      readonly state: "trial";
      readonly accessUntil: Instant | null;
      readonly trialEndsAt: Instant;
    }
  | {
      readonly state: "active";
      readonly accessUntil: Instant | null;
      readonly shape: PlanShape;
      readonly paidCount: number;
      readonly remaining: number;
      readonly nextPaymentAt: Instant | null;
      readonly standing: "good" | "past-due";
      readonly graceUntil?: Instant;
      /** Set when the schedule was cancelled inside a paid period: access runs to `nextPaymentAt`'s period end,
       * then lapses `cancelled` (03 §5.4.3 / §5.4.5). Additive to 03 §5.2's shape — S-P-12's "cancelled in period"
       * state has no other home; recorded for the 03 owner in the L-007 1h entry. */
      readonly cancelledAt?: Instant;
    }
  | {
      readonly state: "paid-in-full";
      readonly accessUntil: Instant | null;
      readonly shape: PlanShape;
      readonly paidAt: Instant;
      readonly paidAtPlacement?: Instant;
    }
  /** The admin on / off toggle — overrides every other standing, both ways (ADR-093; fix: offer-4). */
  | {
      readonly state: "toggled";
      readonly on: boolean;
      readonly accessUntil: Instant | null;
      readonly reason: string;
      readonly toggledBy: AdminId;
      readonly at: Instant;
      readonly until?: Instant;
    }
  | {
      readonly state: "lapsed";
      readonly lapsedAt: Instant;
      readonly reason: LapseReason;
    };

/** Every standing also carries the deposit, because it is credited on the bill wherever it was paid (ADR-097). */
export type AccessState = AccessStanding & { readonly deposit?: DepositRecord };

/** What one webhook or toggle did — the spine's return value (03 §5.2). */
export type AccessChange = {
  readonly familyId: FamilyId;
  readonly before: AccessState;
  readonly after: AccessState;
  readonly events: ReadonlyArray<EventName>;
  readonly handled: "handled" | "skipped-duplicate" | "ignored";
};

/** 03 §5.3 — the `details.reason` vocabulary; the `ErrorCode` beside each is the envelope's status (01 §4a). */
export type PaymentsErrorReason =
  | "E_FAMILY_NOT_FOUND"
  | "E_ACTOR_FORBIDDEN"
  | "E_PLAN_INVALID"
  | "E_ALREADY_PAID"
  | "E_TRIAL_USED"
  | "E_LINK_EXPIRED"
  | "E_PAYMENTS_DISABLED"
  | "E_EVENT_UNVERIFIED"
  | "E_EVENT_UNRESOLVED"
  | "E_PROVIDER"
  | "E_TEST_USER"
  | "E_DFY_FAMILY"
  | "E_PAYMENT_NOT_DUE"
  | "payments-not-configured";

export type PaymentsErrorDetails = {
  readonly reason: PaymentsErrorReason;
  readonly provider?: string;
};

export type PaymentsResult<T> = Result<T, PaymentsErrorDetails>;

/** What `createPaymentLink` hands back to S-A-10 (03 §5.2). */
export type PaymentLink = {
  readonly url: Url;
  readonly reference: LinkRef;
  readonly expiresAt: Instant;
};

/** `startTrial` is not an error when the family already used its trial (03 §5.3). */
export type TrialStart =
  | { readonly trialEndsAt: Instant }
  | { readonly alreadyUsed: true };

/**
 * The app's view over the swappable provider (03 §5.2). Every method returns a `Result` (03 §1 rule 4); nothing
 * throws across the connector.
 */
export interface PurchasePath {
  /** Path (a), admin only; `balance-after-week-1` before `paymentDueAt` is `E_PAYMENT_NOT_DUE` (ADR-094). */
  createPaymentLink(
    familyId: FamilyId,
    kind: LinkKind,
    plan: PlanShape,
    actor: Actor,
    custom?: Money,
  ): Promise<PaymentsResult<PaymentLink>>;
  /** Path (b), the parent; `self-serve-app` after the trial (ADR-091). */
  createCheckout(
    familyId: FamilyId,
    preset: PricePreset,
    plan: PlanShape,
    actor: Actor,
  ): Promise<PaymentsResult<{ readonly url: Url }>>;
  /** The single completion spine; idempotent on `eventId` (03 §5.4.3). */
  handleWebhook(event: RawProviderEvent): Promise<PaymentsResult<AccessChange>>;
  /** Pure read — `access-gate`, rail row 7, S-P-10 / 12, S-A-10 / 18 / 19. */
  getAccess(familyId: FamilyId): Promise<PaymentsResult<AccessState>>;
  /** `app/child-linking` on the first child; a done-for-you family is `E_DFY_FAMILY` (ADR-068 / 093). */
  startTrial(
    familyId: FamilyId,
    actor: Actor,
  ): Promise<PaymentsResult<TrialStart>>;
  /** Called by `placements` on L-1b `placement.started`; idempotent per placement (ADR-093 / 094). */
  openDfyAccess(
    familyId: FamilyId,
    placementId: PlacementId,
    actor: Actor,
  ): Promise<PaymentsResult<AccessChange>>;
  /** Admin only: the general on / off toggle; overrides every standing (ADR-093). */
  setAccess(
    familyId: FamilyId,
    on: boolean,
    reason: string,
    actor: Actor,
    until?: Instant,
  ): Promise<PaymentsResult<AccessChange>>;
  /** The hosted portal; cancellation stays in-app. */
  portal(
    familyId: FamilyId,
    actor: Actor,
  ): Promise<PaymentsResult<{ readonly url: Url }>>;
  /** The presets, from `config` — never a literal (03 §5.2; 01 §3.2 rule 1). */
  prices(): ReadonlyArray<Price>;
}

/** The five scheduled jobs `payments` owns (01 §4f; 02 §4.5 "jobs"); the cron shells call them by name. */
export type PaymentJobName =
  | "expire-trials"
  | "trial-reminders"
  | "expire-past-due"
  | "expire-cancelled-subscriptions"
  | "payment-due-sweep";

/** What one sweep did — the cron run-summary line reads it (01 §4f). */
export type PaymentJobRun = {
  readonly job: PaymentJobName;
  readonly handled: number;
  readonly skipped: number;
};

/** The jobs binding beside `payments` (same inside, same store); fails closed until boot configures it. */
export interface PaymentsJobs {
  run(job: PaymentJobName, now: Instant): Promise<PaymentsResult<PaymentJobRun>>;
}
