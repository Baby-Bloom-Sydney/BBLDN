// connections — the module's type surface (01 §2.5). `connections` owns the connection stage model
// (`00-glossary` §1.2; 03 §2.2) as a **slice** of `positions`: its K-row handlers are registered with the stage
// model at boot and it is never called directly (03 §2.1). The stage vocabulary itself is `shared-types`' and is
// re-exported by `index.ts`.
import type { ENUMS } from "@/modules/shared-types";
import type {
  AdvanceInput,
  ConnectionId,
  ConnectionStage,
  Email,
  Instant,
  ISODate,
  NannyId,
  ParentId,
  PositionId,
  PositionStage,
  Result,
  StateAfter,
  TransitionHandler,
  TransitionId,
  UnitOfWork,
} from "@/modules/shared-types";
import type { Comms } from "@/modules/comms";
import type { ConnectionCard } from "./lib/connection-card-view";

/**
 * The K-row handlers the boot file registers with the stage model (03 §2.1). `TransitionHandler` is
 * `shared-types`' (03 §2.5; ADR-119) — `connections` has no arrow to `positions` (01 §2.3) and needs none: the
 * boot file, which may import both, hands these to `positions.registerSlice`.
 */
export type { ConnectionCard };

export type ConnectionsSlice = ReadonlyArray<TransitionHandler>;

export type ConnectionsErrorDetails = {
  readonly reason:
    | "E_ENTITY_NOT_FOUND"
    | "E_PRECONDITION_FAILED"
    | "E_TRANSITION_NOT_ALLOWED"
    | "connections-not-configured";
  readonly which?: string;
};

export type ConnectionsResult<T> = Result<T, ConnectionsErrorDetails>;

/**
 * The read `positions` calls to fill `activeConnectionWithFamily` on `getForMatching` (03 §7.5 — "comes on
 * `positions.getForMatching` (from the `connections` connector)").
 *
 * GAP — recorded in the L-005 F-a PROGRESS entry. 03 names the fact and names where it comes from, but no
 * section states this method's name or signature; this is the minimum that satisfies the sentence, and the
 * owning section (03 §7.5 / 01 §2.4) should confirm it.
 */
export type ConnectionsReads = {
  readonly liveNannyIdsForParent: (
    parentId: ParentId,
  ) => Promise<ConnectionsResult<ReadonlyArray<NannyId>>>;
  readonly liveCountForPosition: (
    positionId: PositionId,
  ) => Promise<ConnectionsResult<number>>;
  /**
   * `1g` — what rows 4 and 5 of the parent rail are derived from (03 §2.3: "any connection ≥ `INTRO_SCHEDULED`"
   * / "≥ `INTRO_COMPLETE`; outcome stage shown") and what S-P-08 lists. A **summary**, not the row: no parent
   * id, no expiry, no availability — a screen has no use for them.
   *
   * Connector extension, raised for ratification with the two above (03 §7.5 states neither signature either).
   */
  readonly forParent: (
    parentId: ParentId,
  ) => Promise<ConnectionsResult<ReadonlyArray<ConnectionSummary>>>;
};

/** One connection as a parent's screens and rail see it (04 §6.2 S-P-08 states; 04 §7.1 rows 4-5). */
export type ConnectionSummary = {
  readonly connectionId: ConnectionId;
  readonly positionId: PositionId;
  readonly nannyId: NannyId;
  readonly stage: ConnectionStage;
  readonly origin: ConnectionOrigin;
  readonly meetingAt?: Instant;
  /** 04 §6.2 S-P-08: an admin-set time reads "arranged by your matchmaker", a parent-set one does not. */
  readonly meetingSetBy?: "parent" | "nanny" | "admin" | "system";
  readonly meetingOutcome?: MeetingOutcome;
  readonly trialDate?: ISODate;
};

// ── The inside (`1g`) ──

/**
 * One connection row (02 §4.2 `connection_requests`), as the module holds it. Only the fields the 25 K rows and
 * the two reads actually move are here: a column the stage model never touches (the `held_for_verification`
 * pair, `phone_exchanged_at`) belongs to whoever writes it, not to this record.
 */
export type ConnectionRecord = {
  readonly connectionId: ConnectionId;
  readonly positionId: PositionId;
  readonly parentId: ParentId;
  readonly nannyId: NannyId;
  readonly stage: ConnectionStage;
  readonly origin: ConnectionOrigin;
  readonly createdAt: Instant;
  readonly version: number;
  readonly expiresAt?: Instant;
  readonly meetingAt?: Instant;
  readonly meetingSetBy?: "parent" | "nanny" | "admin" | "system";
  readonly meetingOutcome?: MeetingOutcome;
  readonly trialDate?: ISODate;
  readonly fillInitiatedBy?: "parent" | "nanny" | "admin";
  readonly availabilitySlots?: number;
  /** the terms K-20 carries and L-1 needs (03 §2.4) */
  readonly terms?: PlacementTerms;
};

export type ConnectionOrigin = (typeof ENUMS.connection_origin)[number];
export type MeetingOutcome = (typeof ENUMS.meeting_outcome)[number];

/** K-20's payload, and what the L-1 cascade hands `placements` (03 §2.4). */
export type PlacementTerms = {
  readonly weeklyHours: number;
  readonly hourlyRatePence: number;
  readonly startDate: ISODate;
};

export type ConnectionStore = {
  get(connectionId: ConnectionId): Promise<Result<ConnectionRecord | null>>;
  /** Every connection on one position — I-2's "≥ 1 live connection" and K-26's blast both read it. */
  forPosition(
    positionId: PositionId,
  ): Promise<Result<ReadonlyArray<ConnectionRecord>>>;
  /** Every connection a parent holds, across positions — S-P-08's list and `liveNannyIdsForParent`. */
  forParent(
    parentId: ParentId,
  ): Promise<Result<ReadonlyArray<ConnectionRecord>>>;
  put(record: ConnectionRecord, uow?: UnitOfWork): Promise<Result<void>>;
};

/**
 * How a K row fires a cascade into a row it does not own (P-3 · P-4 · P-5, L-1, and K-26 on its siblings).
 *
 * `connections` has **no arrow to `positions`** (01 §2.3; the cycle R2 closed), so it cannot call `advance`
 * itself — the same reason `registerSlice` had to be inverted. The dispatcher is therefore injected at boot,
 * which may import both, and is declared structurally here exactly as `TransitionHandler` was before ADR-119.
 * Typed only from `shared-types`, which every module may import.
 */
export type AdvanceFn = (
  input: AdvanceInput<TransitionId>,
) => Promise<Result<StateAfter>>;

/**
 * What a K row needs from `positions` without importing it: whether the position is live, and how many of its
 * connections are live. Both are preconditions the rows state (K-1 "position live"; P-3 / P-4's cascade
 * conditions), and both are facts about a row this module does not own.
 */
export type PositionFacts = {
  readonly stage: PositionStage;
  readonly parentId: ParentId;
};

export type ConnectionsDeps = {
  readonly store: ConnectionStore;
  readonly advance: AdvanceFn;
  /** the position's stage, read through the injected reader rather than an import (01 §2.3) */
  readonly positionFacts: (
    positionId: PositionId,
  ) => Promise<Result<PositionFacts | null>>;
  readonly comms: Comms;
  /** the nanny's verification level and isolation — K-1 / K-2 / K-3's preconditions (I-5) */
  readonly nannyFacts: (nannyId: NannyId) => Promise<Result<NannyFacts | null>>;
  /**
   * The parent, resolved for comms (03 §8.1: "the caller passes fully resolved data" — `comms` never looks a
   * person up). K-1's C-c cascade needs it, because a call mirror carries the address its `call-confirmation`
   * goes to, and so do the parent-side messages of 03 §8.3.
   *
   * A **port**, because `connections` may not import `auth` for a person lookup and has no other road to one.
   * Left optional so the module is usable with none: without it C-c is not fired and the parent's messages are
   * not sent — recorded, never a guessed address.
   */
  readonly recipientOf?: (
    parentId: ParentId,
  ) => Promise<
    Result<{ readonly email: Email; readonly name?: string } | null>
  >;
  readonly clock?: () => Instant;
};

export type NannyFacts = {
  readonly verificationLevel: string;
  readonly isolated: boolean;
  readonly firstName?: string;
  readonly email?: Email;
};

// ── S-P-08 (04 §6.2) ──

export type ParentConnectionsProps = {
  readonly cards: ReadonlyArray<ConnectionCard>;
  /** the read failed — the heading still stands, with the error line (04 §6.2 L·E·E) */
  readonly failed?: boolean;
};

export type ParentConnectionsLoad =
  | { readonly kind: "signed-out" }
  | { readonly kind: "failed" }
  | { readonly kind: "cards"; readonly cards: ReadonlyArray<ConnectionCard> };
