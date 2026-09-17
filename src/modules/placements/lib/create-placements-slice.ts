// 03 §2.4 "Placement" — the three L-row `TransitionHandler`s. Each runs **inside** the caller's unit of work,
// writes through the store port, emits its `placement.*` event under the same `uow`, runs its cascades and
// answers a `StateAfter`.
//
// The three rows are short but they are where the money model attaches, so each carries one clause worth
// stating in full:
//
//   **L-1** emits `placement.confirmed` — "emitted here, by the K-20 cascade, **never by K-20**" (fix: A-28 /
//   R9), and "**no payment trigger here** — nothing is charged on the call or at placement" (ADR-094).
//   **L-1b** is where done-for-you access switches **on**, with no trial (ADR-093), the 30-day satisfaction
//   window starts (ADR-088 / 090) and `paymentDueAt = startedAt + 7 d` is set (ADR-094) — the `payment-due-sweep`
//   raises the bill then. Still nothing is charged now.
//   **L-2** ends the placement and takes the position (P-6) and the connection (K-23) with it.
import { Events, nowInstant, ok } from "@/modules/platform";
import type {
  AdvanceInput,
  ConnectionId,
  EndReason,
  EventName,
  Instant,
  ISODate,
  NannyId,
  ParentId,
  PlacementId,
  PlacementState,
  PositionId,
  Result,
  StateAfter,
  TransitionId,
  TransitionSpec,
  UnitOfWork,
} from "@/modules/shared-types";
import { ENUMS } from "@/modules/shared-types";
import type {
  PlacementRecord,
  PlacementsDeps,
  PlacementsSlice,
} from "../types";
import { PLACEMENT_TRANSITIONS } from "./placement-transitions";
import { PLACEMENT_GUARDS } from "./placement-guards";
import { runPlacementCascades } from "./placement-cascades";

type Input = AdvanceInput<TransitionId>;
type Emit = Parameters<typeof Events.emit>[0];

/** L-1's payload — everything the K-20 cascade hands over (03 §2.4). */
type ConfirmPayload = {
  readonly connectionId: ConnectionId;
  readonly positionId: PositionId;
  readonly parentId: ParentId;
  readonly nannyId: NannyId;
  readonly weeklyHours: number;
  readonly hourlyRatePence: number;
  readonly startDate: ISODate;
};

const isConfirmPayload = (payload: unknown): payload is ConfirmPayload => {
  const candidate = payload as ConfirmPayload | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.connectionId === "string" &&
    typeof candidate.positionId === "string" &&
    typeof candidate.nannyId === "string" &&
    typeof candidate.weeklyHours === "number" &&
    typeof candidate.hourlyRatePence === "number" &&
    typeof candidate.startDate === "string"
  );
};

const EVENT_OF: Readonly<Record<string, EventName>> = Object.freeze({
  "L-1": "placement.confirmed",
  "L-1b": "placement.started",
  "L-2": "placement.ended",
});

const stateAfter = (
  record: PlacementRecord,
  events: ReadonlyArray<EventName>,
  changedAt: Instant,
  cascaded: StateAfter["cascaded"],
): StateAfter =>
  Object.freeze({
    entity: { kind: "placement" as const, id: record.placementId },
    stage: record.state,
    version: record.version,
    changedAt,
    cascaded: Object.freeze([...cascaded]),
    events: Object.freeze([...events]),
  });

function confirmed(
  input: Input,
  payload: ConfirmPayload,
  now: Instant,
): PlacementRecord {
  return Object.freeze({
    placementId: input.entity.id as PlacementId,
    positionId: payload.positionId,
    connectionId: payload.connectionId,
    parentId: payload.parentId,
    nannyId: payload.nannyId,
    source: "connection" as const,
    state: "CONFIRMED" as PlacementState,
    weeklyHours: payload.weeklyHours,
    hourlyRatePence: payload.hourlyRatePence,
    startDate: payload.startDate,
    createdAt: now,
    version: 1,
  });
}

function moved(
  spec: TransitionSpec,
  input: Input,
  record: PlacementRecord,
  now: Instant,
): Result<PlacementRecord> {
  if (spec.id === "L-1b")
    return ok(
      Object.freeze({
        ...record,
        state: "ACTIVE" as PlacementState,
        startedAt: now,
        version: record.version + 1,
      }),
    );
  const payload = input.payload as {
    readonly endReason?: EndReason;
    readonly endNotes?: string;
  };
  if (
    !(ENUMS.end_reason as ReadonlyArray<string>).includes(
      payload.endReason ?? "",
    )
  )
    return PLACEMENT_GUARDS.invalidPayload("endReason");
  return ok(
    Object.freeze({
      ...record,
      state: "ENDED" as PlacementState,
      endedAt: now,
      endReason: payload.endReason,
      ...(payload.endNotes === undefined ? {} : { endNotes: payload.endNotes }),
      version: record.version + 1,
    }),
  );
}

function propsFor(
  spec: TransitionSpec,
  record: PlacementRecord,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    placementId: record.placementId,
    connectionId: record.connectionId,
    nannyId: record.nannyId,
    ...(spec.id === "L-2" ? {} : { startDate: record.startDate }),
    ...(spec.id === "L-2" ? {} : { weeklyHours: record.weeklyHours }),
    ...(spec.id === "L-2" && record.endReason !== undefined
      ? { endReason: record.endReason }
      : {}),
  });
}

async function commit(
  deps: PlacementsDeps,
  spec: TransitionSpec,
  input: Input,
  next: PlacementRecord,
  uow: UnitOfWork,
  now: Instant,
): Promise<Result<StateAfter>> {
  const written = await deps.store.put(next, uow);
  if (!written.ok) return written;
  const name = EVENT_OF[spec.id] as EventName;
  const emitted = await Events.emit(
    {
      name,
      actor: input.actor,
      subject: input.entity,
      positionId: next.positionId,
      props: propsFor(spec, next),
      idempotencyKey: input.idempotencyKey,
    } as Emit,
    { uow },
  );
  if (!emitted.ok) return emitted;
  const cascaded = await runPlacementCascades({
    deps,
    id: spec.id,
    record: next,
    key: input.idempotencyKey,
    uow,
  });
  if (!cascaded.ok) return cascaded;
  return ok(stateAfter(next, [name], now, cascaded.value));
}

function handlerFor(deps: PlacementsDeps, spec: TransitionSpec) {
  const clock = deps.clock ?? nowInstant;
  return Object.freeze({
    id: spec.id,
    run: async (input: Input, uow: UnitOfWork): Promise<Result<StateAfter>> => {
      const read = await deps.store.get(input.entity.id as PlacementId);
      if (!read.ok) return read;
      const record = read.value;
      if (record === null && !spec.from.includes(null))
        return PLACEMENT_GUARDS.notFound();

      const actorOk = PLACEMENT_GUARDS.checkActor(spec, input.actor, record);
      if (!actorOk.ok) return actorOk;
      const from = PLACEMENT_GUARDS.checkFrom(
        spec,
        input,
        record?.state ?? null,
      );
      if (!from.ok) return from;

      const now = clock();
      if (from.value === "noop")
        return ok(stateAfter(record as PlacementRecord, [], now, []));

      if (spec.id === "L-1") {
        if (!isConfirmPayload(input.payload))
          return PLACEMENT_GUARDS.invalidPayload("L-1");
        // I-3: "≤ 1 non-ended placement per position". The `0007` partial unique index enforces it underneath;
        // refusing here is what makes it read as a rule rather than as a driver error.
        const onPosition = await deps.store.forPosition(
          input.payload.positionId,
        );
        if (!onPosition.ok) return onPosition;
        if (onPosition.value.some((each) => each.state !== "ENDED"))
          return PLACEMENT_GUARDS.precondition("PLACEMENT_ALREADY_LIVE");
        return commit(
          deps,
          spec,
          input,
          confirmed(input, input.payload, now),
          uow,
          now,
        );
      }

      const next = moved(spec, input, record as PlacementRecord, now);
      if (!next.ok) return next;
      return commit(deps, spec, input, next.value, uow, now);
    },
  });
}

export function createPlacementsSlice(deps: PlacementsDeps): PlacementsSlice {
  return Object.freeze(
    PLACEMENT_TRANSITIONS.map((spec) => handlerFor(deps, spec)),
  );
}
