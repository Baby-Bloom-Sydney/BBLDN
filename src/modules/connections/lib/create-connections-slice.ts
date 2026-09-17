// 03 §2.4 "Connection" — the 25 K-row `TransitionHandler`s. Each handler runs **inside** the caller's unit of
// work: it checks the row's `from`, the §2.5 actor rule and the row's own preconditions, writes the connection
// through the store port, emits the row's event under the same `uow` (03 §9.2 rule 1 — a failed event write
// fails the transition, never a silent drop), runs the cascades the row names, and answers a `StateAfter`.
//
// The one structural difference from `positions`' own slice: this module has **no arrow to `positions`**
// (01 §2.3), so it cannot call `advance` to fire P-3 / P-4 / P-5 / L-1 / K-26. The dispatcher is injected at
// boot as `deps.advance` — the same inversion `registerSlice` is, in the other direction.
//
// Messages go out **after** the write, never inside it: `advance` is atomic and an email that has left cannot
// be rolled back (see `connection-messages.ts`).
import { Events, err, newId, nowInstant, ok } from "@/modules/platform";
import type {
  AdvanceInput,
  ConnectionId,
  ConnectionStage,
  EventName,
  Instant,
  NannyId,
  PositionId,
  Result,
  StateAfter,
  TransitionId,
  TransitionSpec,
  UnitOfWork,
} from "@/modules/shared-types";
import type {
  ConnectionRecord,
  ConnectionsDeps,
  ConnectionsSlice,
} from "../types";
import { CONNECTION_TRANSITIONS } from "./connection-transitions";
import { CONNECTION_GUARDS } from "./connection-guards";
import { CONNECTION_STEPS } from "./connection-steps";
import { checkPreconditions } from "./connection-preconditions";
import { runCascades } from "./connection-cascades";
import { sendRowMessages } from "./send-row-messages";
import type { StepPayload } from "./connection-steps";

type Input = AdvanceInput<TransitionId>;
type Emit = Parameters<typeof Events.emit>[0];

/** The payload of a creating row (K-1 / K-2 / K-3): everything the row needs to build a connection from nothing. */
type CreatePayload = StepPayload & {
  readonly positionId: PositionId;
  readonly nannyId: NannyId;
  readonly origin?: ConnectionRecord["origin"];
};

const isCreatePayload = (payload: unknown): payload is CreatePayload =>
  typeof payload === "object" &&
  payload !== null &&
  typeof (payload as CreatePayload).positionId === "string" &&
  typeof (payload as CreatePayload).nannyId === "string";

const ORIGIN_OF: Readonly<Record<string, ConnectionRecord["origin"]>> =
  Object.freeze({
    "K-1": "parent_request",
    "K-2": "precheck_response",
    "K-3": "nanny_application",
  });

const stateAfter = (
  record: ConnectionRecord,
  events: ReadonlyArray<EventName>,
  changedAt: Instant,
  cascaded: StateAfter["cascaded"],
): StateAfter =>
  Object.freeze({
    entity: { kind: "connection" as const, id: record.connectionId },
    stage: record.stage,
    version: record.version,
    changedAt,
    cascaded: Object.freeze([...cascaded]),
    events: Object.freeze([...events]),
  });

/** K-1 / K-2 / K-3 — the row creates the connection from the payload plus the position's own parent. */
function created(
  spec: TransitionSpec,
  input: Input,
  payload: CreatePayload,
  parentId: ConnectionRecord["parentId"],
  now: Instant,
): ConnectionRecord {
  return Object.freeze({
    connectionId: input.entity.id as ConnectionId,
    positionId: payload.positionId,
    parentId,
    nannyId: payload.nannyId,
    stage: spec.to as ConnectionStage,
    origin: payload.origin ?? ORIGIN_OF[spec.id] ?? "parent_request",
    createdAt: now,
    version: 1,
    ...(payload.availabilitySlots === undefined
      ? {}
      : { availabilitySlots: payload.availabilitySlots }),
  });
}

async function emitFor(
  spec: TransitionSpec,
  input: Input,
  next: ConnectionRecord,
  from: ConnectionStage | null,
  uow: UnitOfWork,
): Promise<Result<ReadonlyArray<EventName>>> {
  const name = CONNECTION_STEPS.eventNameFor(spec.id);
  if (name === undefined) return ok([]);
  // `Emit` is a **discriminated** union — one member per event name, each with its own prop shape — so an
  // envelope whose `name` is the wide `EventName` matches no single member and cannot be assigned without a
  // cast. One call site serving 23 rows is worth that cast, and nothing is lost by it: the props are checked
  // at run time against 03 §9.3's zod schema on the way into `emit`, where an extra or missing prop is a
  // **refused** emit (which, under a `uow`, fails the whole row). The types were never the guard here.
  const envelope = {
    name,
    actor: input.actor,
    subject: input.entity,
    positionId: next.positionId,
    props: CONNECTION_STEPS.propsFor(spec.id, name, next, from),
    idempotencyKey: input.idempotencyKey,
  } as Emit;
  const emitted = await Events.emit(envelope, { uow });
  return emitted.ok ? ok([name]) : emitted;
}

async function commit(
  deps: ConnectionsDeps,
  spec: TransitionSpec,
  input: Input,
  next: ConnectionRecord,
  from: ConnectionStage | null,
  context: {
    readonly uow: UnitOfWork;
    readonly now: Instant;
    readonly positionStage: string;
  },
): Promise<Result<StateAfter>> {
  const written = await deps.store.put(next, context.uow);
  if (!written.ok) return written;
  const events = await emitFor(spec, input, next, from, context.uow);
  if (!events.ok) return events;
  const cascaded = await runCascades({
    deps,
    id: spec.id,
    record: next,
    key: input.idempotencyKey,
    uow: context.uow,
    positionStage: context.positionStage,
    fromPositionClose:
      input.actor.kind === "system" && input.actor.id === "cascade",
    placementId: newId(),
  });
  if (!cascaded.ok) return cascaded;
  await sendRowMessages(deps, spec.id, next);
  return ok(stateAfter(next, events.value, context.now, cascaded.value));
}

function handlerFor(deps: ConnectionsDeps, spec: TransitionSpec) {
  const clock = deps.clock ?? nowInstant;
  return Object.freeze({
    id: spec.id,
    run: async (input: Input, uow: UnitOfWork): Promise<Result<StateAfter>> => {
      const read = await deps.store.get(input.entity.id as ConnectionId);
      if (!read.ok) return read;
      const record = read.value;
      if (record === null && !spec.from.includes(null))
        return CONNECTION_GUARDS.notFound();

      const actorOk = CONNECTION_GUARDS.checkActor(spec, input.actor, record);
      if (!actorOk.ok) return actorOk;
      const from = CONNECTION_GUARDS.checkFrom(
        spec,
        input,
        record?.stage ?? null,
      );
      if (!from.ok) return from;

      const now = clock();
      if (from.value === "noop")
        return ok(stateAfter(record as ConnectionRecord, [], now, []));

      const payload = input.payload as StepPayload & Partial<CreatePayload>;
      const positionId = record?.positionId ?? payload.positionId;
      if (positionId === undefined)
        return CONNECTION_GUARDS.invalidPayload("positionId");
      const facts = await deps.positionFacts(positionId);
      if (!facts.ok) return facts;
      if (facts.value === null)
        return CONNECTION_GUARDS.precondition("POSITION_NOT_FOUND");

      /**
       * The actor rule's create-time half, and it is a real hole without it. `CONNECTION_GUARDS.checkActor`
       * compares a user against the **record's** party, and a creating row has no record — so a signed-in
       * parent could otherwise post K-1 with a stranger's `positionId` and file a connection against that
       * family's position. The position's own parent is the authority (the created row already takes its
       * `parentId` from there), so the comparison is made against it, before anything is written.
       *
       * The same class as `1f`'s CRITICAL on `holdSlotAction`: a client-supplied subject id written onto a row
       * without checking whose it is.
       */
      if (
        input.actor.kind === "user" &&
        input.actor.role === "parent" &&
        (facts.value.parentId as string) !== (input.actor.id as string)
      )
        return err("FORBIDDEN", "This actor may not move the connection", {
          reason: "E_ACTOR_FORBIDDEN" as const,
          which: "not-party" as const,
        });

      const nannyId = record?.nannyId ?? payload.nannyId;
      const checked = await checkPreconditions({
        deps,
        id: spec.id,
        positionStage: facts.value.stage,
        nannyId: (nannyId ?? "") as string,
        parentId: facts.value.parentId as string,
        positionId: positionId as string,
        ...(payload.availabilitySlots === undefined
          ? {}
          : { availabilitySlots: payload.availabilitySlots }),
      });
      if (!checked.ok) return checked;

      const next =
        record === null
          ? isCreatePayload(input.payload)
            ? created(spec, input, input.payload, facts.value.parentId, now)
            : null
          : CONNECTION_STEPS.nextRecord(
              spec.id,
              spec.to as ConnectionStage,
              record,
              payload,
            );
      if (next === null) return CONNECTION_GUARDS.invalidPayload(spec.id);

      return commit(deps, spec, input, next, record?.stage ?? null, {
        uow,
        now,
        positionStage: facts.value.stage,
      });
    },
  });
}

export function createConnectionsSlice(
  deps: ConnectionsDeps,
): ConnectionsSlice {
  return Object.freeze(
    CONNECTION_TRANSITIONS.map((spec) => handlerFor(deps, spec)),
  );
}
