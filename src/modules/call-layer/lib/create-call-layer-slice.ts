// 03 §2.4 "Call layer" — the C-row `TransitionHandler`s over the call mirror (02 R-1). Each handler runs
// **inside** the caller's unit of work: it checks the row's `from`, the actor rule and the row's precondition,
// writes the mirror through the store port, emits the row's `call.*` event under the same `uow` (03 §9.2 rule 1
// — a failed event write fails the transition, never a silent drop), and answers a `StateAfter`.
//
// What lives here is the state machine only. The `scheduling` writes the rows name as side effects (`book`,
// `reschedule`, `cancel`, `markDone`, `markNoAnswer`) and the comms messages are the orchestrator's
// (`create-call-layer.ts`), because they happen outside the transaction and before or after it.
import { Events, err, nowInstant, ok } from "@/modules/platform";
import { ACTIVE_STATUSES } from "@/modules/shared-types";
import type {
  Actor,
  AdvanceInput,
  Booking,
  BookingId,
  CallState,
  EventName,
  ISO,
  PositionId,
  Result,
  StateAfter,
  TransitionId,
  TransitionSpec,
  UnitOfWork,
} from "@/modules/shared-types";
import type { TransitionHandler } from "@/modules/positions";
import type { Scheduling } from "@/modules/scheduling";
import type {
  CallDonePayload,
  CallLayerSlice,
  CallMirror,
  CallMirrorStore,
  CallRequestPayload,
  CallSlotPayload,
} from "../types";
import { CALL_TRANSITIONS } from "./call-transitions";

type SliceDeps = {
  readonly store: CallMirrorStore;
  readonly scheduling: Scheduling;
  readonly clock?: () => ISO;
};

type Input = AdvanceInput<TransitionId>;
type Emit = Parameters<typeof Events.emit>[0];
type Step = {
  readonly mirror: CallMirror;
  readonly event: Emit;
};
type StepResult = Result<Step>;

const stale = (which: string) =>
  err("CONFLICT", "The call has moved since you read it", {
    reason: "E_STALE_STATE" as const,
    which,
  });

const forbidden = (which: "mover" | "not-party" | "job-not-named") =>
  err("FORBIDDEN", "This actor may not move the call", {
    reason: "E_ACTOR_FORBIDDEN" as const,
    which,
  });

const precondition = (which: string) =>
  err("CONFLICT", "The call cannot move yet", {
    reason: "E_PRECONDITION_FAILED" as const,
    which,
  });

const positionOf = (input: Input): PositionId => input.entity.id as PositionId;

const stateAfter = (
  mirror: CallMirror,
  events: ReadonlyArray<EventName>,
  changedAt: ISO,
): StateAfter =>
  Object.freeze({
    entity: { kind: "call" as const, id: mirror.positionId },
    stage: mirror.state,
    version: mirror.version,
    changedAt,
    cascaded: Object.freeze([]),
    events: Object.freeze([...events]),
  });

const isActive = (booking: Booking) =>
  (ACTIVE_STATUSES as ReadonlyArray<string>).includes(booking.status);

function moverOf(actor: Actor): TransitionSpec["movers"][number] {
  if (actor.kind === "admin") return "admin";
  if (actor.kind === "system") return "system";
  return actor.role === "parent" ? "user:parent" : "user:nanny";
}

/** 03 §2.5 actor rule: a user only on their own call and only on rows naming their role; a job only where named. */
function checkActor(
  spec: TransitionSpec,
  actor: Actor,
  mirror: CallMirror | null,
): Result<void> {
  const mover = moverOf(actor);
  if (!spec.movers.includes(mover)) return forbidden("mover");
  if (actor.kind === "user" && mirror !== null && mirror.parentId !== actor.id)
    return forbidden("not-party");
  if (actor.kind === "system" && !(spec.systemJobs ?? []).includes(actor.id))
    return forbidden("job-not-named");
  return ok(undefined);
}

function checkFrom(
  spec: TransitionSpec,
  input: Input,
  current: CallState | null,
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

const isRequestPayload = (payload: unknown): payload is CallRequestPayload =>
  typeof payload === "object" &&
  payload !== null &&
  typeof (payload as CallRequestPayload).parentId === "string" &&
  ((payload as CallRequestPayload).type === "matchmaking" ||
    (payload as CallRequestPayload).type === "onboarding") &&
  typeof (payload as CallRequestPayload).recipient?.email === "string";

const isSlotPayload = (payload: unknown): payload is CallSlotPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "bookingId" in payload &&
  (typeof payload.bookingId === "string" || payload.bookingId === null);

const isDonePayload = (payload: unknown): payload is CallDonePayload =>
  typeof payload === "object" &&
  payload !== null &&
  typeof (payload as { readonly outcome?: unknown }).outcome === "string" &&
  (payload as { readonly outcome: string }).outcome !== "no-answer";

const invalidPayload = (which: string) =>
  err("VALIDATION", "The transition payload is not what the row carries", {
    reason: "E_PAYLOAD_INVALID" as const,
    which,
  });

/** C-1 / C-2 precondition: the booking is active and its subject is this position (03 §3.3 I-10). */
async function bookingFor(
  scheduling: Scheduling,
  bookingId: BookingId,
  positionId: PositionId,
  actor: Actor,
): Promise<Result<Booking>> {
  const read = await scheduling.getBooking(bookingId, actor);
  if (!read.ok) return precondition("BOOKING_NOT_FOR_SUBJECT");
  const booking = read.value;
  const mine =
    booking.subject.kind === "position" &&
    booking.subject.positionId === positionId;
  if (!mine || !isActive(booking))
    return precondition("BOOKING_NOT_FOR_SUBJECT");
  return ok(booking);
}

function requested(
  input: Input,
  existing: CallMirror | null,
  now: ISO,
): StepResult {
  if (!isRequestPayload(input.payload)) return invalidPayload("request");
  const payload = input.payload;
  const mirror: CallMirror = {
    positionId: positionOf(input),
    parentId: payload.parentId,
    type: payload.type,
    state: "awaiting-slot",
    bookingId: null,
    requestedAt: now,
    recipient: payload.recipient,
    ...(payload.aboutNanny === undefined
      ? {}
      : { aboutNanny: payload.aboutNanny }),
    noAnswerCount: 0,
    version: (existing?.version ?? 0) + 1,
  };
  return ok({
    mirror,
    event: {
      name: "call.requested",
      actor: input.actor,
      subject: input.entity,
      positionId: mirror.positionId,
      props: { positionId: mirror.positionId, type: mirror.type },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

async function slotChosen(
  deps: SliceDeps,
  input: Input,
  mirror: CallMirror,
): Promise<StepResult> {
  if (!isSlotPayload(input.payload) || input.payload.bookingId === null)
    return invalidPayload("bookingId");
  const booking = await bookingFor(
    deps.scheduling,
    input.payload.bookingId,
    mirror.positionId,
    input.actor,
  );
  if (!booking.ok) return booking;
  const next: CallMirror = {
    ...mirror,
    state: "slot-chosen",
    bookingId: booking.value.id,
    version: mirror.version + 1,
  };
  return ok({
    mirror: next,
    event: {
      name: "call.slot-chosen",
      actor: input.actor,
      subject: input.entity,
      positionId: mirror.positionId,
      props: {
        positionId: mirror.positionId,
        bookingId: booking.value.id,
        type: mirror.type,
        slotAt: booking.value.start,
      },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

async function previousSlotAt(
  deps: SliceDeps,
  mirror: CallMirror,
  actor: Actor,
): Promise<ISO | undefined> {
  if (mirror.bookingId === null) return undefined;
  const read = await deps.scheduling.getBooking(mirror.bookingId, actor);
  return read.ok ? read.value.start : undefined;
}

/** C-2: a new active booking moves the slot; `null` clears it (`call.rescheduled { slotAt: null }` — fix: A-27). */
async function rescheduled(
  deps: SliceDeps,
  input: Input,
  mirror: CallMirror,
): Promise<StepResult> {
  if (!isSlotPayload(input.payload)) return invalidPayload("bookingId");
  const previous = await previousSlotAt(deps, mirror, input.actor);
  const base = { ...mirror, version: mirror.version + 1 };
  const event = {
    actor: input.actor,
    subject: input.entity,
    positionId: mirror.positionId,
    idempotencyKey: input.idempotencyKey,
  };
  if (input.payload.bookingId === null)
    return ok({
      mirror: { ...base, state: "awaiting-slot", bookingId: null },
      event: {
        ...event,
        name: "call.rescheduled",
        props: {
          positionId: mirror.positionId,
          type: mirror.type,
          slotAt: null,
          reason: "cancelled",
          ...(previous === undefined ? {} : { previousSlotAt: previous }),
        },
      },
    });
  const booking = await bookingFor(
    deps.scheduling,
    input.payload.bookingId,
    mirror.positionId,
    input.actor,
  );
  if (!booking.ok) return booking;
  return ok({
    mirror: { ...base, state: "slot-chosen", bookingId: booking.value.id },
    event: {
      ...event,
      name: "call.rescheduled",
      props: {
        positionId: mirror.positionId,
        bookingId: booking.value.id,
        type: mirror.type,
        slotAt: booking.value.start,
        ...(previous === undefined ? {} : { previousSlotAt: previous }),
      },
    },
  });
}

function done(
  input: Input,
  mirror: CallMirror,
  outcome: CallDonePayload["outcome"] | "cancelled",
): StepResult {
  const next: CallMirror = {
    ...mirror,
    state: "done",
    outcome,
    version: mirror.version + 1,
  };
  return ok({
    mirror: next,
    event: {
      name: "call.done",
      actor: input.actor,
      subject: input.entity,
      positionId: mirror.positionId,
      props: {
        positionId: mirror.positionId,
        ...(mirror.bookingId === null ? {} : { bookingId: mirror.bookingId }),
        type: mirror.type,
        outcome,
      },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

/** C-5: the no-answer clears the pointer; the row ended `no-answer` stays reachable by subject (02 R-1). */
function noAnswer(input: Input, mirror: CallMirror): StepResult {
  const next: CallMirror = {
    ...mirror,
    state: "awaiting-slot",
    bookingId: null,
    noAnswerCount: mirror.noAnswerCount + 1,
    version: mirror.version + 1,
  };
  return ok({
    mirror: next,
    event: {
      name: "call.rescheduled",
      actor: input.actor,
      subject: input.entity,
      positionId: mirror.positionId,
      props: {
        positionId: mirror.positionId,
        type: mirror.type,
        slotAt: null,
        reason: "no-answer",
      },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

async function step(
  deps: SliceDeps,
  spec: TransitionSpec,
  input: Input,
  mirror: CallMirror | null,
  now: ISO,
): Promise<StepResult> {
  switch (spec.id) {
    case "C-a":
    case "C-b":
    case "C-c":
      return requested(input, mirror, now);
    case "C-1":
      return slotChosen(deps, input, mirror as CallMirror);
    case "C-2":
      return rescheduled(deps, input, mirror as CallMirror);
    case "C-3":
      return isDonePayload(input.payload)
        ? done(input, mirror as CallMirror, input.payload.outcome)
        : invalidPayload("outcome");
    case "C-4":
      return done(input, mirror as CallMirror, "cancelled");
    case "C-5":
      return noAnswer(input, mirror as CallMirror);
    default:
      return invalidPayload(spec.id);
  }
}

async function commit(
  deps: SliceDeps,
  stepResult: Step,
  uow: UnitOfWork,
  now: ISO,
): Promise<Result<StateAfter>> {
  const written = await deps.store.put(stepResult.mirror, uow);
  if (!written.ok) return written;
  const emitted = await Events.emit(stepResult.event, { uow });
  if (!emitted.ok) return emitted;
  return ok(stateAfter(stepResult.mirror, [stepResult.event.name], now));
}

function handlerFor(deps: SliceDeps, spec: TransitionSpec): TransitionHandler {
  const clock = deps.clock ?? nowInstant;
  const replays = new Map<string, StateAfter>();
  return Object.freeze({
    id: spec.id,
    run: async (input, uow) => {
      const replayed = replays.get(input.idempotencyKey);
      if (spec.idempotency === "key" && replayed !== undefined)
        return ok(replayed);
      const read = await deps.store.get(positionOf(input));
      if (!read.ok) return read;
      const mirror = read.value;
      if (mirror === null && !spec.from.includes(null))
        return err("NOT_FOUND", "No call for this position", {
          reason: "E_ENTITY_NOT_FOUND" as const,
          entity: "call" as const,
        });
      const actorOk = checkActor(spec, input.actor, mirror);
      if (!actorOk.ok) return actorOk;
      const from = checkFrom(spec, input, mirror?.state ?? null);
      if (!from.ok) return from;
      const now = clock();
      if (from.value === "noop")
        return ok(stateAfter(mirror as CallMirror, [], now));
      const next = await step(deps, spec, input, mirror, now);
      if (!next.ok) return next;
      const result = await commit(deps, next.value, uow, now);
      if (result.ok && spec.idempotency === "key")
        replays.set(input.idempotencyKey, result.value);
      return result;
    },
  });
}

export function createCallLayerSlice(deps: SliceDeps): CallLayerSlice {
  return Object.freeze(CALL_TRANSITIONS.map((spec) => handlerFor(deps, spec)));
}
