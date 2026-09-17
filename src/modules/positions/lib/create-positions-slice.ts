// 03 §2.4 "Position" — the P-row `TransitionHandler`s. Each handler runs **inside** the caller's unit of work:
// it checks the row's `from`, the 03 §2.5 actor rule and the row's own preconditions, writes the position row
// through the store port, emits the row's `position.*` event under the same `uow` (03 §9.2 rule 1 — a failed
// event write fails the transition, never a silent drop), runs the cascades the row names, and answers a
// `StateAfter`.
//
// Two cascades belong to a P row itself and are run here, through `advance`, never by importing the slice that
// owns them (fix: A-2 / R2): **P-2 → C-a** (the call the parent lands on — 04 §3.3 triggers a / b) and
// **P-7 → C-4** (a closed position closes its open call). The cascades that *arrive* at a P row — P-3, P-4, P-5
// from the K rows, P-6 from L-2 — are fired by their origin slice (`1f` / `1g`), which is also where their
// connection- and placement-side preconditions live; what this file owns is the position's own move.
import { Events, err, nowInstant, ok } from "@/modules/platform";
import { ENUMS } from "@/modules/shared-types";
import type {
  Actor,
  AdvanceInput,
  EventName,
  Instant,
  NannyId,
  PositionId,
  PositionStage,
  Result,
  StateAfter,
  TransitionId,
  TransitionSpec,
  TransitionMover,
  UnitOfWork,
} from "@/modules/shared-types";
import type {
  PositionActivatePayload,
  PositionClosePayload,
  PositionEndPayload,
  PositionOpenPayload,
  PositionRecord,
  PositionStore,
  PositionsSlice,
} from "../types";
import { advance } from "./advance";
import { POSITION_TRANSITIONS } from "./position-transitions";

type SliceDeps = {
  readonly store: PositionStore;
  /** 03 §6 — P-2's "district in areas table" precondition; `positions` may import `areas` (S). */
  readonly isInServiceArea: (district: string) => Promise<boolean>;
  readonly clock?: () => Instant;
};

type Input = AdvanceInput<TransitionId>;
type Emit = Parameters<typeof Events.emit>[0];
type Step = { readonly record: PositionRecord; readonly event: Emit };

const stale = (which: string) =>
  err("CONFLICT", "The position has moved since you read it", {
    reason: "E_STALE_STATE" as const,
    which,
  });

const forbidden = (which: "mover" | "not-party" | "job-not-named") =>
  err("FORBIDDEN", "This actor may not move the position", {
    reason: "E_ACTOR_FORBIDDEN" as const,
    which,
  });

const precondition = (which: string) =>
  err("CONFLICT", "The position cannot move yet", {
    reason: "E_PRECONDITION_FAILED" as const,
    which,
  });

const invalidPayload = (which: string) =>
  err("VALIDATION", "The transition payload is not what the row carries", {
    reason: "E_PAYLOAD_INVALID" as const,
    which,
  });

const positionOf = (input: Input): PositionId => input.entity.id as PositionId;

const moverOf = (actor: Actor): TransitionMover => {
  if (actor.kind === "admin") return "admin";
  if (actor.kind === "system") return "system";
  return actor.role === "parent" ? "user:parent" : "user:nanny";
};

/** 03 §2.5 actor rule: a user only on their own position and only on rows naming their role; a job only where named. */
function checkActor(
  spec: TransitionSpec,
  actor: Actor,
  record: PositionRecord | null,
): Result<void> {
  if (!spec.movers.includes(moverOf(actor))) return forbidden("mover");
  if (
    actor.kind === "user" &&
    actor.role === "parent" &&
    record !== null &&
    (record.parentId as string) !== (actor.id as string)
  )
    return forbidden("not-party");
  if (actor.kind === "system" && !(spec.systemJobs ?? []).includes(actor.id))
    return forbidden("job-not-named");
  return ok(undefined);
}

function checkFrom(
  spec: TransitionSpec,
  input: Input,
  current: PositionStage | null,
): Result<"proceed" | "noop"> {
  if (input.expectedFrom !== current) return stale("expectedFrom");
  if (spec.from.includes(current)) return ok("proceed");
  if (current === spec.to)
    return spec.idempotency === "reject" ? stale("already-there") : ok("noop");
  return err("CONFLICT", "That move is not allowed from here", {
    reason: "E_TRANSITION_NOT_ALLOWED" as const,
    from: current,
    to: spec.to,
  });
}

const isOpenPayload = (payload: unknown): payload is PositionOpenPayload => {
  const candidate = payload as PositionOpenPayload | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.parentId === "string" &&
    typeof candidate.recipient?.email === "string" &&
    typeof candidate.detail?.area?.district === "string" &&
    (ENUMS.position_source as ReadonlyArray<string>).includes(candidate.source)
  );
};

const stageProps = (record: PositionRecord, spec: TransitionSpec) =>
  Object.freeze({
    transition: spec.id,
    to: record.stage as PositionStage,
    source: record.source,
    areaDistrict: record.detail.area.district,
  });

const stateAfter = (
  record: PositionRecord,
  events: ReadonlyArray<EventName>,
  changedAt: Instant,
  cascaded: StateAfter["cascaded"] = [],
): StateAfter =>
  Object.freeze({
    entity: { kind: "position" as const, id: record.positionId },
    stage: record.stage,
    version: record.version,
    changedAt,
    cascaded: Object.freeze([...cascaded]),
    events: Object.freeze([...events]),
  });

/** P-1 / P-2 — the row creates the position. I-1, the areas table and the parent's mobile are its preconditions. */
async function created(
  deps: SliceDeps,
  spec: TransitionSpec,
  input: Input,
  existing: PositionRecord | null,
  now: Instant,
): Promise<Result<Step>> {
  if (!isOpenPayload(input.payload)) return invalidPayload(spec.id);
  const payload = input.payload;
  const live = await deps.store.liveForParent(payload.parentId);
  if (!live.ok) return live;
  if (live.value !== null && live.value.positionId !== positionOf(input))
    return precondition("ONE_LIVE_POSITION");
  if (spec.id === "P-2") {
    if (payload.mobile.trim() === "") return precondition("PARENT_HAS_MOBILE");
    if (!(await deps.isInServiceArea(payload.detail.area.district)))
      return precondition("DISTRICT_NOT_IN_AREAS");
  }
  const record: PositionRecord = {
    positionId: positionOf(input),
    parentId: payload.parentId,
    source: payload.source,
    stage: spec.to as PositionStage,
    detail: payload.detail,
    recipient: payload.recipient,
    ...(payload.leadId === undefined ? {} : { leadId: payload.leadId }),
    createdAt: existing?.createdAt ?? now,
    precheck: existing?.precheck ?? null,
    version: (existing?.version ?? 0) + 1,
  };
  const name: EventName =
    spec.id === "P-1" ? "position.drafted" : "position.created";
  return ok({
    record,
    event: {
      name,
      actor: input.actor,
      subject: input.entity,
      positionId: record.positionId,
      props: { ...stageProps(record, spec), from: existing?.stage ?? null },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

/** P-3 · P-4 · P-5 — the cascades that arrive from the K rows; the position's own move and its event. */
function moved(
  spec: TransitionSpec,
  input: Input,
  record: PositionRecord,
  now: Instant,
): Result<Step> {
  const filledBy =
    spec.id === "P-5"
      ? (input.payload as Partial<PositionActivatePayload>).filledByNannyId
      : undefined;
  if (spec.id === "P-5" && typeof filledBy !== "string")
    return invalidPayload("filledByNannyId");
  const next: PositionRecord = {
    ...record,
    stage: spec.to as PositionStage,
    ...(spec.id === "P-5"
      ? { activatedAt: now, filledByNannyId: filledBy as NannyId }
      : {}),
    version: record.version + 1,
  };
  const name: EventName =
    spec.id === "P-3"
      ? "position.connecting"
      : spec.id === "P-4"
        ? "position.reopened"
        : "position.active";
  return ok({
    record: next,
    event: {
      name,
      actor: input.actor,
      subject: input.entity,
      positionId: next.positionId,
      // 03 §9.3: `position.active` carries the stage props only — `filledByNannyId` rides on `position.ended`
      // (the schema is the authority, and an extra prop is a refused emit, not a silently dropped one).
      props: { ...stageProps(next, spec), from: record.stage },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

/** P-6 — `ACTIVE → ENDED` (+ `end_reason`). */
function ended(input: Input, record: PositionRecord): Result<Step> {
  const spec = SPEC_OF.P6;
  const reason = (input.payload as Partial<PositionEndPayload>).endReason;
  if (!(ENUMS.end_reason as ReadonlyArray<string>).includes(reason ?? ""))
    return invalidPayload("endReason");
  const next: PositionRecord = {
    ...record,
    stage: "ENDED",
    endReason: reason,
    version: record.version + 1,
  };
  return ok({
    record: next,
    event: {
      name: "position.ended",
      actor: input.actor,
      subject: input.entity,
      positionId: next.positionId,
      props: {
        ...stageProps(next, spec),
        from: record.stage,
        endReason: reason,
        ...(next.filledByNannyId === undefined
          ? {}
          : { filledByNannyId: next.filledByNannyId }),
      },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

/** P-7 — `DRAFT | OPEN | CONNECTING → CLOSED` (+ `close_reason`). */
function closed(input: Input, record: PositionRecord): Result<Step> {
  const spec = SPEC_OF.P7;
  const reason = (input.payload as Partial<PositionClosePayload>).closeReason;
  if (!(ENUMS.close_reason as ReadonlyArray<string>).includes(reason ?? ""))
    return invalidPayload("closeReason");
  const next: PositionRecord = {
    ...record,
    stage: "CLOSED",
    closeReason: reason,
    version: record.version + 1,
  };
  return ok({
    record: next,
    event: {
      name: "position.closed",
      actor: input.actor,
      subject: input.entity,
      positionId: next.positionId,
      props: {
        ...stageProps(next, spec),
        from: record.stage,
        closeReason: reason,
      },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

const SPEC_OF = Object.freeze({
  P6: POSITION_TRANSITIONS.find((spec) => spec.id === "P-6") as TransitionSpec,
  P7: POSITION_TRANSITIONS.find((spec) => spec.id === "P-7") as TransitionSpec,
});

async function step(
  deps: SliceDeps,
  spec: TransitionSpec,
  input: Input,
  record: PositionRecord | null,
  now: Instant,
): Promise<Result<Step>> {
  switch (spec.id) {
    case "P-1":
    case "P-2":
      return created(deps, spec, input, record, now);
    case "P-3":
    case "P-4":
    case "P-5":
      return moved(spec, input, record as PositionRecord, now);
    case "P-6":
      return ended(input, record as PositionRecord);
    case "P-7":
      return closed(input, record as PositionRecord);
    default:
      return invalidPayload(spec.id);
  }
}

/**
 * P-2 → C-a and P-7 → C-4 (03 §2.4). Dispatched through `advance` with the caller's `uow`, so the call mirror
 * moves inside the same transaction; a position with no call mirror (P-7 before the call was ever requested) is
 * not an error — `NOT_FOUND` from the call slice is the "there was nothing to close" answer, and only that
 * reason is tolerated.
 */
async function cascade(
  input: Input,
  record: PositionRecord,
  uow: UnitOfWork,
): Promise<Result<StateAfter["cascaded"]>> {
  const transition = input.transition === "P-2" ? "C-a" : "C-4";
  const actor = { kind: "system" as const, id: "cascade" as const };
  const call = { kind: "call" as const, id: record.positionId };
  const result = await advance({
    entity: call,
    transition,
    actor,
    payload:
      transition === "C-a"
        ? {
            parentId: record.parentId as string,
            type: "matchmaking",
            recipient: record.recipient,
          }
        : {},
    expectedFrom: transition === "C-a" ? null : "awaiting-slot",
    idempotencyKey: `${input.idempotencyKey}:${transition}`,
    uow,
  });
  if (result.ok)
    return ok([
      { entity: call, transition, stage: result.value.stage } as const,
    ]);
  return result.error.code === "NOT_FOUND" ? ok([]) : result;
}

async function commit(
  deps: SliceDeps,
  spec: TransitionSpec,
  input: Input,
  next: Step,
  uow: UnitOfWork,
  now: Instant,
): Promise<Result<StateAfter>> {
  const written = await deps.store.put(next.record, uow);
  if (!written.ok) return written;
  const emitted = await Events.emit(next.event, { uow });
  if (!emitted.ok) return emitted;
  if (spec.id !== "P-2" && spec.id !== "P-7")
    return ok(stateAfter(next.record, [next.event.name], now));
  const cascaded = await cascade(input, next.record, uow);
  if (!cascaded.ok) return cascaded;
  return ok(stateAfter(next.record, [next.event.name], now, cascaded.value));
}

function handlerFor(deps: SliceDeps, spec: TransitionSpec) {
  const clock = deps.clock ?? nowInstant;
  return Object.freeze({
    id: spec.id,
    run: async (input: Input, uow: UnitOfWork): Promise<Result<StateAfter>> => {
      const read = await deps.store.get(positionOf(input));
      if (!read.ok) return read;
      const record = read.value;
      if (record === null && !spec.from.includes(null))
        return err("NOT_FOUND", "No such position", {
          reason: "E_ENTITY_NOT_FOUND" as const,
          entity: "position" as const,
        });
      const actorOk = checkActor(spec, input.actor, record);
      if (!actorOk.ok) return actorOk;
      const from = checkFrom(spec, input, record?.stage ?? null);
      if (!from.ok) return from;
      const now = clock();
      if (from.value === "noop")
        return ok(stateAfter(record as PositionRecord, [], now));
      const next = await step(deps, spec, input, record, now);
      if (!next.ok) return next;
      return commit(deps, spec, input, next.value, uow, now);
    },
  });
}

export function createPositionsSlice(deps: SliceDeps): PositionsSlice {
  return Object.freeze(
    POSITION_TRANSITIONS.map((spec) => handlerFor(deps, spec)),
  );
}
