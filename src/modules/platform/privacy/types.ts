// platform/privacy — the type surface of the erasure job (07 §6.1; B-46). `platform/README.md` has named
// `platform/privacy` as this capability's home since Phase 1; this is it, minus `exportUser` (Art 15), which has
// no surface yet and is not invented here.
//
// Two types that are deliberately not the same: `PrivacyStore` is the **port** — raw operations over `0028`'s two
// RPCs and the storage API — and `Privacy` is the **connector** the outside calls. The port is what `src/boot`
// implements and what `privacy.stub.ts` doubles; the connector is what a road, a cron and a settings screen see.
import type { Instant, Result } from "@/modules/shared-types";
import type { UnitOfWork } from "@/modules/shared-types";
import type { Log } from "../log/types";

/** How the request reached us. An erasure asked for by email is actioned by an admin; both are Art 17. */
export type ErasureRoad = "self-service" | "admin";

/** What 07 §6.2 keeps, named by class. The same three names `LEGAL.erasureRetains` carries and `0028` returns. */
export type ErasureRetainedClass = "money" | "consent" | "safeguarding";

/**
 * Why an erasure was refused. `live-placement` and `live-subscription` are 07 §6.1 step 1 and are **recorded** —
 * the person ends the one or cancels the other and asks again. `retry` is contention or an invariant: `0027`'s
 * pseudonym guard, or a DBS decision being recorded at the same moment, which by design beats an erasure. It is
 * the sweep's to re-attempt, never something to tell the person to act on.
 */
export type ErasureRefusal = "live-placement" | "live-subscription" | "retry";

export type ErasureObject = {
  readonly bucket: string;
  readonly path: string;
  readonly entityKind: "user" | "child";
  readonly entityId: string;
};

export type ErasureOutcome = {
  readonly outcome: "erased" | "already-erased" | "refused";
  readonly reason?: ErasureRefusal;
  readonly retainedClasses: ReadonlyArray<ErasureRetainedClass>;
  readonly scrubbedTables: ReadonlyArray<string>;
  readonly objectCount: number;
};

export type ErasureRequest = {
  readonly requestId: string;
  readonly subjectUserId: string;
  readonly road: ErasureRoad;
  readonly state: "requested" | "completed" | "refused";
  readonly refusalReason: string | null;
  readonly requestedAt: Instant;
};

export type PrivacyErrorDetails = {
  readonly reason:
    | "privacy-not-configured"
    | "subject-not-found"
    | "request-not-found"
    | "request-not-open"
    | "retry"
    | "store-failed";
};

/** The port. Every method returns a `Result`; none throws. */
export type PrivacyStore = {
  /** Idempotent by `0028`'s partial unique: a subject with an open request gets that one back. */
  openRequest(input: {
    readonly subjectUserId: string;
    readonly requestedBy: string;
    readonly road: ErasureRoad;
  }): Promise<Result<ErasureRequest, PrivacyErrorDetails>>;
  readRequest(
    requestId: string,
  ): Promise<Result<ErasureRequest | null, PrivacyErrorDetails>>;
  listOpenRequests(
    limit: number,
  ): Promise<Result<ReadonlyArray<ErasureRequest>, PrivacyErrorDetails>>;
  /** The subject of an email-borne request, resolved server-side. Never an id the caller supplied (ADR-145). */
  findSubjectByEmail(
    email: string,
  ): Promise<Result<string | null, PrivacyErrorDetails>>;
  collectObjects(
    subjectUserId: string,
  ): Promise<Result<ReadonlyArray<ErasureObject>, PrivacyErrorDetails>>;
  removeObject(
    object: ErasureObject,
  ): Promise<Result<void, PrivacyErrorDetails>>;
  /**
   * 07 §6.1 step 6 — subjects whose scrub completed before `before` and whose `auth.users` row is still there.
   * Only "old enough to consider": whether each may actually go is `purgeSubject`'s question, per subject.
   */
  listPurgeCandidates(input: {
    readonly before: Instant;
    readonly limit: number;
  }): Promise<
    Result<
      ReadonlyArray<{
        readonly subjectUserId: string;
        readonly scrubbedAt: Instant;
      }>,
      PrivacyErrorDetails
    >
  >;
  /**
   * `0030`'s one write per subject. `windows` is `LEGAL.erasureRetains` as the job reads it — the dates live in
   * config (ADR-179) and are handed across, never re-derived here or in SQL.
   */
  purgeSubject(input: {
    readonly subjectUserId: string;
    readonly windows: Readonly<
      Record<string, { readonly months: number; readonly from: string }>
    >;
  }): Promise<Result<PurgeOutcome, PrivacyErrorDetails>>;
  /**
   * 07 §6.2 — one class of the retention schedule, one bounded batch, one transaction (`0031`). The spec is
   * `config/retention.ts` handed across whole; the store never derives a date.
   */
  sweepRetentionClass(input: {
    readonly class: string;
    readonly spec: RetentionSpec["spec"];
    readonly limit: number;
  }): Promise<Result<RetentionClassOutcome, PrivacyErrorDetails>>;
  /** `0028`'s one write: every database step of 07 §6.1 or none of them. */
  runErasure(input: {
    readonly subjectUserId: string;
    readonly requestId: string;
    readonly deletedObjects: ReadonlyArray<ErasureObject>;
    readonly uow?: UnitOfWork;
  }): Promise<Result<ErasureOutcome, PrivacyErrorDetails>>;
};

/**
 * What `0030` answered for one subject (07 §6.1 step 6; L-009 `3g`). ADR-182's two refusals are both here and
 * they are told apart by *shape*: a **recorded** refusal is this value with `outcome: "refused"` and a reason
 * the operator can act on (or wait out); a **raised** one never becomes a `PurgeOutcome` at all — it is a
 * `CONFLICT` with `reason: "retry"` from the store, because the transaction rolled back.
 */
export type PurgeOutcome = {
  readonly outcome: "purged" | "already-purged" | "refused";
  /** `not-erased` · `not-scrubbed` · `retained-money` · `retained-consent` · `retained-safeguarding` */
  readonly reason?: string;
  /** For a `retained-*` refusal: the date the window runs out. Nothing to do until then. */
  readonly until?: string;
};

/**
 * One class of 07 §6.2's schedule, in the shape `0031` reads it (L-009 `3h`). `spec` carries **exactly** what the
 * SQL reads and nothing else — the window and the anchors — because a payload containing a field the job ignores
 * reads like a field the job honours. The treatment is not sent: the arm is chosen by `class`, and `targets` is
 * config's own documentation, joined by the gate rather than by the job.
 */
export type RetentionSpec = {
  readonly class: string;
  readonly spec: {
    readonly window:
      { readonly months: number } | { readonly days: number } | null;
    readonly anchors: ReadonlyArray<{
      readonly table: string;
      readonly column: string;
    }>;
  };
};

/** What `0031` answered for one class. `capped` means the batch limit was reached and more rows are waiting. */
export type RetentionClassOutcome = {
  readonly class: string;
  readonly removed: number;
  readonly nulled: number;
  readonly capped: boolean;
};

/**
 * What one retention run did. Four numbers rather than two, because they mean four different things:
 * `handled` is rows acted on, `skipped` is classes the schedule carries that no job acts on today (07 §6.2's ★
 * windows, awaiting BAI, plus the evidence log and the backups), `failed` is ADR-182's raised refusals — a class
 * whose batch rolled back and which tomorrow retries — and `capped` names the classes with more rows waiting.
 */
export type RetentionSweepSummary = {
  readonly handled: number;
  readonly skipped: number;
  readonly failed: number;
  readonly capped: ReadonlyArray<string>;
};

/** What one purge run did, for the cron's run-summary line. */
export type PurgeSweepSummary = {
  readonly purged: number;
  /** still held by a retention window, or not yet safe to purge — the number an operator reads */
  readonly retained: number;
};

/** The connector. */
export type Privacy = {
  /**
   * The self-service road: the person asking is the subject. Opens (or finds) her request, removes her objects,
   * runs the one transaction, and emits `account.deleted` if it erased.
   */
  eraseOwnAccount(input: {
    readonly subjectUserId: string;
    readonly road?: ErasureRoad;
  }): Promise<Result<ErasureOutcome, PrivacyErrorDetails>>;
  /** The admin road, step 1: record the request that arrived by email. Erases nothing. */
  openRequestForEmail(input: {
    readonly email: string;
    readonly requestedBy: string;
  }): Promise<Result<ErasureRequest, PrivacyErrorDetails>>;
  /** Every request still open — the admin screen's read, and the only list it has. */
  listOpenRequests(
    limit: number,
  ): Promise<Result<ReadonlyArray<ErasureRequest>, PrivacyErrorDetails>>;
  /** The admin road, step 2, and the sweep's unit: the subject is read off the request row, never passed in. */
  runRequest(
    requestId: string,
  ): Promise<Result<ErasureOutcome, PrivacyErrorDetails>>;
  /**
   * `/api/cron/purge-scrubbed-users` (07 §6.1 step 6): the housekeeping half. It never pushes — a subject still
   * inside any retention window is counted and left, which in practice is years.
   */
  purgeScrubbedUsers(
    now: Instant,
  ): Promise<Result<PurgeSweepSummary, PrivacyErrorDetails>>;
  /**
   * `/api/cron/retention-sweep` (07 §6.2): one bounded batch per acting class, per run. It is the counterpart to
   * the erasure job — that one is a person asking, this one is time passing — and it is what eventually lets
   * `purgeScrubbedUsers` stop answering `rows-outstanding`.
   */
  sweepRetention(
    now: Instant,
  ): Promise<Result<RetentionSweepSummary, PrivacyErrorDetails>>;
  /** `/api/cron/delete-account` (01 §4f): re-attempt every request still open. */
  sweepRequests(
    now: Instant,
  ): Promise<
    Result<
      { readonly handled: number; readonly skipped: number },
      PrivacyErrorDetails
    >
  >;
};

export type PrivacyDeps = {
  readonly store: PrivacyStore;
  readonly log?: Log;
  readonly onErased?: (input: {
    readonly subjectUserId: string;
    readonly scrubbedTables: ReadonlyArray<string>;
    readonly objectCount: number;
  }) => Promise<void>;
  readonly sweepLimit?: number;
  /**
   * 07 §6.2's own sentence — the sweep "emits `retention.applied` { table, count }". One per class that actually
   * acted: a class that removed and nulled nothing has nothing to record, and an event saying otherwise would
   * make the audit trail claim work that did not happen (`run-erasure`'s rule for `account.deleted`, applied to
   * a class instead of a person).
   */
  readonly onSwept?: (input: {
    readonly class: string;
    readonly rowCount: number;
  }) => Promise<void>;
};

export type MemoryPrivacyStore = PrivacyStore & {
  readonly requests: ReadonlyArray<ErasureRequest>;
  readonly removed: ReadonlyArray<ErasureObject>;
  readonly erased: ReadonlyArray<string>;
};
