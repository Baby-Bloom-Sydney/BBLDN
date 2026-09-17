// The `call-layer` stub — an in-memory call mirror per position, seeded by the caller. It honours the shapes of
// 03 §2.7 (the tagged `CallResult`, the derived nanny-call state, the `CallStateRead`) so that S-P-02, S-N-02 and
// the admin call queue can be built and tested before `scheduling` and the S5 schema exist.
//
// It is **not** the call state machine: C-1…C-5 with their preconditions, reminders and events are Phase 1g. It
// moves its own mirror only so a caller can see the shape of what it will get, and every method that would have
// needed a booking row it does not have says so with `E_PRECONDITION_FAILED`.
import { err, ok } from "@/modules/platform";
import type {
  Booking,
  CallState,
  CallType,
  Instant,
  PositionId,
  StateAfter,
  UserId,
} from "@/modules/shared-types";
import type { CallLayer, CallRef } from "./types";

export type StubCallSeed = {
  readonly calls?: Readonly<
    Record<
      string,
      {
        readonly state: CallState;
        readonly type: CallType;
        /** the parent the call belongs to — what `findOpenCall` (connector extension, 1d) keys on */
        readonly parentId?: UserId;
      }
    >
  >;
  readonly bookings?: Readonly<Record<string, Booking>>;
};

const AT = "2026-01-01T00:00:00+00:00" as Instant;

const stateAfter = (positionId: PositionId, stage: CallState): StateAfter =>
  Object.freeze({
    entity: { kind: "call" as const, id: positionId },
    stage,
    version: 1,
    changedAt: AT,
    cascaded: Object.freeze([]),
    events: Object.freeze([]),
  });

export function stubCallLayer(seed: StubCallSeed = {}): CallLayer {
  const calls = new Map(Object.entries(seed.calls ?? {}));
  const bookings = new Map(Object.entries(seed.bookings ?? {}));

  const notFound = err("NOT_FOUND", "No call for this subject", {
    reason: "E_ENTITY_NOT_FOUND" as const,
  });

  /** 03 §2.7 — a nanny-commission call's state is derived from its booking row, never stored. */
  const derive = (booking: Booking): CallState => {
    if (booking.status === "no-answer") return "awaiting-slot";
    if (booking.status === "done" || booking.status === "cancelled")
      return "done";
    return "slot-chosen";
  };

  return Object.freeze({
    listSlots: async () => ok(Object.freeze([])),
    chooseSlot: async (positionId) => {
      calls.set(positionId, { state: "slot-chosen", type: "matchmaking" });
      return ok(stateAfter(positionId, "slot-chosen"));
    },
    clearSlot: async (positionId) => {
      calls.set(positionId, { state: "awaiting-slot", type: "matchmaking" });
      return ok(stateAfter(positionId, "awaiting-slot"));
    },
    moveSlot: async (ref: CallRef) => {
      if (ref.kind === "nanny-call") {
        const booking = bookings.get(ref.bookingId);
        return booking === undefined
          ? notFound
          : ok({ kind: "nanny-call" as const, booking });
      }
      calls.set(ref.positionId, { state: "slot-chosen", type: "matchmaking" });
      return ok({
        kind: "call" as const,
        state: stateAfter(ref.positionId, "slot-chosen"),
      });
    },
    openNannyCall: async () =>
      err("CONFLICT", "The stub holds no calendar to book against", {
        reason: "E_PRECONDITION_FAILED" as const,
        which: "scheduling",
      }),
    recordOutcome: async (ref: CallRef) => {
      if (ref.kind === "nanny-call") {
        const booking = bookings.get(ref.bookingId);
        return booking === undefined
          ? notFound
          : ok({ kind: "nanny-call" as const, booking });
      }
      const existing = calls.get(ref.positionId);
      if (existing === undefined) return notFound;
      calls.set(ref.positionId, { ...existing, state: "done" });
      return ok({
        kind: "call" as const,
        state: stateAfter(ref.positionId, "done"),
      });
    },
    findOpenCall: async (parentId) => {
      const open = [...calls.entries()].find(
        ([, call]) => call.parentId === parentId && call.state !== "done",
      );
      if (open === undefined) return ok(null);
      const [positionId, call] = open;
      return ok({
        state: call.state,
        type: call.type,
        positionId: positionId as PositionId,
        afterNoAnswer: false,
      });
    },
    getCallState: async (ref: CallRef) => {
      if (ref.kind === "nanny-call") {
        const booking = bookings.get(ref.bookingId);
        return booking === undefined
          ? notFound
          : ok({
              state: derive(booking),
              type: "nanny-commission" as const,
              booking,
              ...(booking.outcome === undefined
                ? {}
                : { outcome: booking.outcome }),
            });
      }
      const call = calls.get(ref.positionId);
      return call === undefined
        ? notFound
        : ok({ state: call.state, type: call.type });
    },
  });
}
