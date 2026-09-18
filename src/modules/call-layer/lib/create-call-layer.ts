// 03 §2.7 — the inside of `CallLayer`, as the orchestrator the contract describes: a `scheduling` write, then
// `positions.advance` on the C row that names it, then the messages (03 §2.4 side effects). The state machine
// itself is the slice (`create-call-layer-slice.ts`); this file never touches the mirror except to read it.
//
// A `scheduling` write that succeeded but whose `advance` failed is undone (`cancel`) before the error is
// returned, so a parent is never told a time is set when the mirror does not say so — the two are not one
// transaction until the mirror store lives inside the RPC opener (P1-WIRE, ADR-127; recorded).
import { advance } from "@/modules/positions";
import { Events, err, nowInstant, ok } from "@/modules/platform";
import { ACTIVE_STATUSES } from "@/modules/shared-types";
import type {
  Actor,
  Booking,
  BookingId,
  CallOutcome,
  PositionId,
  Result,
  StateAfter,
  UserId,
} from "@/modules/shared-types";
import type {
  CallErrorDetails,
  CallLayer,
  CallLayerDeps,
  CallLayerResult,
  CallMirror,
  CallRef,
  CallResult,
  CallStateRead,
} from "../types";
import { deriveNannyCallState } from "./derive-nanny-call-state";
import { sendCallMessages } from "./call-messages";
import { sendNannyCallMessages } from "./send-nanny-call-messages";
import { schedulingError } from "./scheduling-error";

const notFound = (which: string) =>
  err<CallErrorDetails>("NOT_FOUND", "No call for this subject", {
    reason: "E_ENTITY_NOT_FOUND",
    which,
  });

const noSlot = () =>
  err<CallErrorDetails>("CONFLICT", "No time is set for this call", {
    reason: "E_PRECONDITION_FAILED",
    which: "no-booking",
  });

/** `positions.advance` answers the generic `Result`; the reasons it carries are the §2.5 ones this union names. */
const asCallError = <T>(result: Result<T>): CallLayerResult<T> =>
  result as CallLayerResult<T>;

async function readMirror(
  deps: CallLayerDeps,
  positionId: PositionId,
): Promise<CallLayerResult<CallMirror>> {
  const read = await deps.store.get(positionId);
  if (!read.ok) return asCallError(read);
  return read.value === null ? notFound("position") : ok(read.value);
}

async function readBooking(
  deps: CallLayerDeps,
  bookingId: BookingId | null,
  actor: Actor,
): Promise<Booking | undefined> {
  if (bookingId === null) return undefined;
  const read = await deps.scheduling.getBooking(bookingId, actor);
  return read.ok ? read.value : undefined;
}

const nannyRead = (booking: Booking): CallStateRead => ({
  state: deriveNannyCallState(booking),
  type: "nanny-commission",
  booking,
  ...(booking.outcome === undefined ? {} : { outcome: booking.outcome }),
});

async function advanceCall(
  deps: CallLayerDeps,
  mirror: CallMirror,
  transition: "C-1" | "C-2" | "C-3" | "C-4" | "C-5",
  actor: Actor,
  payload: Readonly<Record<string, unknown>>,
  idempotencyKey: string,
): Promise<CallLayerResult<StateAfter>> {
  const moved = await advance({
    entity: { kind: "call", id: mirror.positionId },
    transition,
    actor,
    payload,
    expectedFrom: mirror.state,
    idempotencyKey,
    at: (deps.clock ?? nowInstant)(),
  });
  return asCallError(moved);
}

async function chooseSlot(
  deps: CallLayerDeps,
  positionId: PositionId,
  slotId: Parameters<CallLayer["chooseSlot"]>[1],
  holdId: Parameters<CallLayer["chooseSlot"]>[2],
  actor: Actor,
  idempotencyKey: string,
): Promise<CallLayerResult<StateAfter>> {
  const mirror = await readMirror(deps, positionId);
  if (!mirror.ok) return mirror;
  const booked = await deps.scheduling.book({
    slotId,
    ...(holdId === undefined ? {} : { holdId }),
    kind: mirror.value.type,
    actor,
    subject: {
      kind: "position",
      positionId,
      parentId: mirror.value.parentId,
    },
    idempotencyKey,
  });
  if (!booked.ok) return schedulingError(booked.error);
  const booking = booked.value.booking;
  const moved = await advanceCall(
    deps,
    mirror.value,
    "C-1",
    actor,
    { bookingId: booking.id },
    idempotencyKey,
  );
  if (!moved.ok) {
    await deps.scheduling.cancel(booking.id, actor, "other");
    return moved;
  }
  await sendCallMessages({
    comms: deps.comms,
    kind: "confirmation",
    mirror: { ...mirror.value, bookingId: booking.id },
    booking,
    now: (deps.clock ?? nowInstant)(),
  });
  return moved;
}

async function movePositionSlot(
  deps: CallLayerDeps,
  positionId: PositionId,
  slotId: Parameters<CallLayer["moveSlot"]>[1],
  actor: Actor,
): Promise<CallLayerResult<CallResult>> {
  const mirror = await readMirror(deps, positionId);
  if (!mirror.ok) return mirror;
  if (mirror.value.bookingId === null) return noSlot();
  const moved = await deps.scheduling.reschedule(
    mirror.value.bookingId,
    slotId,
    actor,
  );
  if (!moved.ok) return schedulingError(moved.error);
  const state = await advanceCall(
    deps,
    mirror.value,
    "C-2",
    actor,
    { bookingId: moved.value.id },
    `${positionId}:move:${slotId}`,
  );
  if (!state.ok) return state;
  await sendCallMessages({
    comms: deps.comms,
    kind: "rescheduled",
    mirror: mirror.value,
    booking: moved.value,
    now: (deps.clock ?? nowInstant)(),
  });
  return ok({ kind: "call", state: state.value });
}

async function clearSlot(
  deps: CallLayerDeps,
  positionId: PositionId,
  actor: Actor,
  reason: Parameters<CallLayer["clearSlot"]>[2],
): Promise<CallLayerResult<StateAfter>> {
  const mirror = await readMirror(deps, positionId);
  if (!mirror.ok) return mirror;
  if (mirror.value.bookingId === null) return noSlot();
  const cancelled = await deps.scheduling.cancel(
    mirror.value.bookingId,
    actor,
    reason,
  );
  if (!cancelled.ok) return schedulingError(cancelled.error);
  const state = await advanceCall(
    deps,
    mirror.value,
    "C-2",
    actor,
    { bookingId: null },
    `${positionId}:clear:${mirror.value.bookingId}`,
  );
  if (!state.ok) return state;
  await sendCallMessages({
    comms: deps.comms,
    kind: "cancelled",
    mirror: mirror.value,
    booking: null,
    now: (deps.clock ?? nowInstant)(),
  });
  return state;
}

async function openNannyCall(
  deps: CallLayerDeps,
  input: Parameters<CallLayer["openNannyCall"]>[0],
): Promise<CallLayerResult<Booking>> {
  const booked = await deps.scheduling.book({
    slotId: input.slotId,
    ...(input.holdId === undefined ? {} : { holdId: input.holdId }),
    kind: "nanny-commission",
    actor: input.actor,
    subject: { kind: "nanny", nannyId: input.nannyId },
    idempotencyKey: input.idempotencyKey,
  });
  if (!booked.ok) return schedulingError(booked.error);
  const booking = booked.value.booking;
  const shared = {
    actor: input.actor,
    subject: { kind: "booking" as const, id: booking.id },
    props: {
      bookingId: booking.id,
      type: "nanny-commission" as const,
      slotAt: booking.start,
    },
    idempotencyKey: input.idempotencyKey,
  };
  await Events.emit({ ...shared, name: "call.requested" });
  await Events.emit({ ...shared, name: "call.slot-chosen" });
  await sendNannyCallMessages({
    comms: deps.comms,
    nannyId: input.nannyId,
    booking,
    ...(deps.adminEmail === undefined ? {} : { adminEmail: deps.adminEmail }),
  });
  return ok(booking);
}

/**
 * Connector extension (`2g`): the nanny's one **active** booking, or `null`. I-10 allows at most one, so the
 * narrowing is the invariant rather than a choice — and a `done` / `no-answer` / `cancelled` row reading as
 * `null` is what lets S-N-02 offer her the calendar again after a no-answer (R5).
 */
async function findNannyBooking(
  deps: CallLayerDeps,
  nannyId: UserId,
): Promise<CallLayerResult<Booking | null>> {
  const rows = await deps.scheduling.listForSubject({ kind: "nanny", nannyId });
  if (!rows.ok) return schedulingError(rows.error);
  const active = rows.value.find((row) =>
    (ACTIVE_STATUSES as ReadonlyArray<string>).includes(row.status),
  );
  return ok(active ?? null);
}

async function nannyOutcome(
  deps: CallLayerDeps,
  bookingId: BookingId,
  outcome: CallOutcome,
  actor: Actor,
): Promise<CallLayerResult<CallResult>> {
  const moved =
    outcome === "no-answer"
      ? await deps.scheduling.markNoAnswer(bookingId, null, actor)
      : outcome === "cancelled"
        ? await deps.scheduling.cancel(bookingId, actor, "admin-cancelled")
        : await deps.scheduling.markDone(bookingId, outcome, actor);
  if (!moved.ok) return schedulingError(moved.error);
  return ok({ kind: "nanny-call", booking: moved.value });
}

async function closeBooking(
  deps: CallLayerDeps,
  mirror: CallMirror,
  outcome: CallOutcome,
  actor: Actor,
): Promise<CallLayerResult<void>> {
  if (mirror.bookingId === null)
    return outcome === "no-answer" ? noSlot() : ok(undefined);
  const moved =
    outcome === "no-answer"
      ? await deps.scheduling.markNoAnswer(mirror.bookingId, null, actor)
      : outcome === "cancelled"
        ? await deps.scheduling.cancel(
            mirror.bookingId,
            actor,
            "admin-cancelled",
          )
        : await deps.scheduling.markDone(mirror.bookingId, outcome, actor);
  return moved.ok ? ok(undefined) : schedulingError(moved.error);
}

async function positionOutcome(
  deps: CallLayerDeps,
  positionId: PositionId,
  outcome: CallOutcome,
  notes: string | undefined,
  actor: Actor,
): Promise<CallLayerResult<CallResult>> {
  const mirror = await readMirror(deps, positionId);
  if (!mirror.ok) return mirror;
  // The state rule gates before any `scheduling` write: a done call is `reject` (C-3) / `noop` (C-4) and must
  // answer as the stage model would, not as a booking row that can no longer move.
  if (mirror.value.state === "done")
    return err<CallErrorDetails>("CONFLICT", "The call is already done", {
      reason: "E_STALE_STATE",
      which: "already-there",
    });
  const closed = await closeBooking(deps, mirror.value, outcome, actor);
  if (!closed.ok) return closed;
  const transition =
    outcome === "no-answer" ? "C-5" : outcome === "cancelled" ? "C-4" : "C-3";
  const payload =
    transition === "C-5"
      ? { bookingId: null }
      : { outcome, ...(notes === undefined ? {} : { notes }) };
  const state = await advanceCall(
    deps,
    mirror.value,
    transition,
    actor,
    payload,
    `${positionId}:${transition}:${mirror.value.version}`,
  );
  return state.ok ? ok({ kind: "call", state: state.value }) : state;
}

async function getCallState(
  deps: CallLayerDeps,
  ref: CallRef,
): Promise<CallLayerResult<CallStateRead>> {
  if (ref.kind === "nanny-call") {
    const read = await deps.scheduling.getBooking(ref.bookingId, {
      kind: "system",
      id: "scheduling",
    });
    return read.ok ? ok(nannyRead(read.value)) : notFound("booking");
  }
  const mirror = await readMirror(deps, ref.positionId);
  if (!mirror.ok) return mirror;
  const booking = await readBooking(deps, mirror.value.bookingId, {
    kind: "system",
    id: "scheduling",
  });
  return ok({
    state: mirror.value.state,
    type: mirror.value.type,
    ...(booking === undefined ? {} : { booking }),
    ...(mirror.value.outcome === undefined
      ? {}
      : { outcome: mirror.value.outcome }),
  });
}

async function findOpenCall(
  deps: CallLayerDeps,
  parentId: Parameters<CallLayer["findOpenCall"]>[0],
): ReturnType<CallLayer["findOpenCall"]> {
  const found = await deps.store.findOpenForParent(parentId);
  if (!found.ok) return asCallError(found);
  if (found.value === null) return ok(null);
  const mirror = found.value;
  const state = await getCallState(deps, {
    kind: "call",
    positionId: mirror.positionId,
  });
  if (!state.ok) return state;
  return ok({
    ...state.value,
    positionId: mirror.positionId,
    ...(mirror.aboutNanny === undefined
      ? {}
      : { aboutNanny: mirror.aboutNanny }),
    afterNoAnswer: mirror.state === "awaiting-slot" && mirror.noAnswerCount > 0,
  });
}

/**
 * 03 §3.6 — "awaiting-slot calls come from `call-layer`". The store enumerates every call that is not `done`;
 * the admin queue decorates (§3.6 again: "`scheduling` returns ids, `admin` decorates"), which is why nothing
 * here reaches for a family's name or number.
 */
async function listOpenCalls(
  deps: CallLayerDeps,
): ReturnType<CallLayer["listOpenCalls"]> {
  const open = await deps.store.listOpen();
  if (!open.ok) return asCallError(open);
  return ok(open.value);
}

export function createCallLayer(deps: CallLayerDeps): CallLayer {
  return Object.freeze({
    listSlots: async (kind, range) => {
      const slots = await deps.scheduling.getAvailableSlots({ kind, ...range });
      return slots.ok ? ok(slots.value) : schedulingError(slots.error);
    },
    chooseSlot: (positionId, slotId, holdId, actor, idempotencyKey) =>
      chooseSlot(deps, positionId, slotId, holdId, actor, idempotencyKey),
    moveSlot: async (ref, slotId, actor) => {
      if (ref.kind === "call")
        return movePositionSlot(deps, ref.positionId, slotId, actor);
      const moved = await deps.scheduling.reschedule(
        ref.bookingId,
        slotId,
        actor,
      );
      return moved.ok
        ? ok({ kind: "nanny-call", booking: moved.value })
        : schedulingError(moved.error);
    },
    clearSlot: (positionId, actor, reason) =>
      clearSlot(deps, positionId, actor, reason),
    openNannyCall: (input) => openNannyCall(deps, input),
    recordOutcome: (ref, outcome, notes, actor) =>
      ref.kind === "nanny-call"
        ? nannyOutcome(deps, ref.bookingId, outcome, actor)
        : positionOutcome(deps, ref.positionId, outcome, notes, actor),
    getCallState: (ref) => getCallState(deps, ref),
    findOpenCall: (parentId) => findOpenCall(deps, parentId),
    findNannyBooking: (nannyId) => findNannyBooking(deps, nannyId),
    listOpenCalls: (): ReturnType<CallLayer["listOpenCalls"]> =>
      listOpenCalls(deps),
  });
}
