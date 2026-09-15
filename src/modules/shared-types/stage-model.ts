// 03 §2.5 — the stage-model contract, type level (exposed by `positions/index.ts`). Copied from the
// contract; the inside is Phase 1e–1g. Stage unions are the 02 §3 enums (one representation — I-7).
import type { Actor } from "./actor";
import type { ENUMS } from "./enums";
import type { EventName } from "./events";
import type { ConnectionId, ParentId, PlacementId, PositionId } from "./ids";
import type { UnitOfWork } from "./platform";
import type { Instant } from "./scalars";
import type { SYSTEM_JOB_NAMES } from "./system-job-names";
import type { TRANSITION_IDS } from "./transition-ids";

export type PositionStage = (typeof ENUMS.position_stage)[number];
export type ConnectionStage = (typeof ENUMS.connection_stage)[number];
export type PlacementState = (typeof ENUMS.placement_state)[number];
export type CallState = (typeof ENUMS.call_state)[number];
export type CallType = (typeof ENUMS.call_type)[number];
export type CallOutcome = (typeof ENUMS.call_outcome)[number];
export type EndReason = (typeof ENUMS.end_reason)[number];
export type CloseReason = (typeof ENUMS.close_reason)[number];
export type Stage =
  | PositionStage
  | ConnectionStage
  | PlacementState
  | CallState;

/** call = the position's call mirror (02 R-1): matchmaking · onboarding; no CallId (fix: A-4 / R1). */
export type EntityRef =
  | { readonly kind: "position"; readonly id: PositionId }
  | { readonly kind: "connection"; readonly id: ConnectionId }
  | { readonly kind: "placement"; readonly id: PlacementId }
  | { readonly kind: "call"; readonly id: PositionId };

export type TransitionId = (typeof TRANSITION_IDS)[number];
export type SystemJobName = (typeof SYSTEM_JOB_NAMES)[number];
export type Mover = "user:parent" | "user:nanny" | "admin" | "system";

export type TransitionSpec = {
  readonly id: TransitionId;
  readonly entity: EntityRef["kind"];
  readonly from: ReadonlyArray<Stage | null>;
  readonly to: Stage;
  readonly movers: ReadonlyArray<Mover>;
  readonly systemJobs?: ReadonlyArray<SystemJobName>;
  readonly idempotency: "noop" | "reject" | "key";
};

/**
 * Payload per transition (03 §2.4 "Preconditions / Side effects" columns — e.g. C-1 / C-2 / C-5 carry
 * `bookingId | null`, K-20 carries hours / rate / start). `positions` (Phase 1e) narrows each entry by
 * declaration merging; until then every id maps to a readonly record.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by positions (Phase 1e)
export interface TransitionPayloadMap extends Record<
  TransitionId,
  Readonly<Record<string, unknown>>
> {}

export type PayloadFor<T extends TransitionId> = TransitionPayloadMap[T];

/** Fields `amend()` may move without a transition (03 §2.2: placement hours, rate, start, roster, notes …). */
export type AmendableFields = Readonly<Record<string, unknown>>;

export type AdvanceInput<T extends TransitionId> = {
  readonly entity: EntityRef;
  readonly transition: T;
  readonly actor: Actor;
  readonly payload: PayloadFor<T>;
  readonly expectedFrom: Stage | null;
  readonly idempotencyKey: string;
  readonly at?: Instant;
  readonly uow?: UnitOfWork;
};

export type StateAfter = {
  readonly entity: EntityRef;
  readonly stage: Stage;
  readonly version: number;
  readonly changedAt: Instant;
  readonly cascaded: ReadonlyArray<{
    readonly entity: EntityRef;
    readonly transition: TransitionId;
    readonly stage: Stage;
  }>;
  readonly events: ReadonlyArray<EventName>;
};

export type AmendInput = {
  readonly entity: EntityRef;
  readonly actor: Actor;
  readonly fields: AmendableFields;
  readonly idempotencyKey: string;
};

export type JourneyStep = {
  readonly row: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly label: string;
  readonly state: "done" | "in-motion" | "pending" | "hidden";
  readonly detail?: string;
};

export type JourneyOwner = ParentId;

export type StageRead = {
  readonly stage: Stage;
  readonly version: number;
  readonly since: Instant;
};
