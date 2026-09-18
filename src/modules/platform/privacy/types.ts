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
  /** `0028`'s one write: every database step of 07 §6.1 or none of them. */
  runErasure(input: {
    readonly subjectUserId: string;
    readonly requestId: string;
    readonly deletedObjects: ReadonlyArray<ErasureObject>;
    readonly uow?: UnitOfWork;
  }): Promise<Result<ErasureOutcome, PrivacyErrorDetails>>;
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
};

export type MemoryPrivacyStore = PrivacyStore & {
  readonly requests: ReadonlyArray<ErasureRequest>;
  readonly removed: ReadonlyArray<ErasureObject>;
  readonly erased: ReadonlyArray<string>;
};
