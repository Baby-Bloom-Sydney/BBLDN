// The `call-layer` half of swap test 1 / 2 (03 §11): keep `index.ts` + `types.ts`, point the connector at the
// stub, and the call surfaces still compile and run. It also pins the two shapes the contract is emphatic about:
// the **tagged** `CallResult` (never `StateAfter | Booking` — fix: A-29) and the nanny-commission call's state
// being **derived** from its booking row (03 §2.7), including `no-answer` reading back as `awaiting-slot` (R5).
import { beforeEach, describe, expect, it } from "vitest";
import {
  callLayer,
  configureCallLayer,
  registerCallLayerSlice,
  stubCallLayer,
} from "@/modules/call-layer";
import {
  advance,
  configurePositions,
  stubPositions,
} from "@/modules/positions";
import type { TransitionHandler } from "@/modules/positions";
import {
  configureUnitOfWork,
  createUnitOfWork,
  err,
  memoryTransactionOpener,
  ok,
} from "@/modules/platform";
import type {
  Actor,
  Booking,
  BookingId,
  BookingStatus,
  Instant,
  PositionId,
} from "@/modules/shared-types";

const POSITION_ID = "position-1" as PositionId;
const BOOKING_ID = "booking-1" as BookingId;
const AT = "2026-01-01T10:00:00+00:00" as Instant;
const ADMIN: Actor = Object.freeze({ kind: "admin", id: "admin-1" as never });

const bookingWith = (status: BookingStatus): Booking =>
  Object.freeze({
    id: BOOKING_ID,
    calendarId: "default" as const,
    kind: "nanny-commission" as const,
    priority: "nanny" as const,
    status,
    subject: { kind: "nanny" as const, nannyId: "nanny-1" as never },
    start: AT,
    end: AT,
    bookedBy: ADMIN,
    bookedAt: AT,
    version: 1,
  });

beforeEach(() => {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configurePositions(stubPositions());
  configureCallLayer(
    stubCallLayer({
      calls: {
        [POSITION_ID]: { state: "awaiting-slot", type: "matchmaking" },
      },
      bookings: { [BOOKING_ID]: bookingWith("booked") },
    }),
  );
});

describe("call-layer through the connector binding", () => {
  it("fails closed before boot configures the inside", async () => {
    configureCallLayer({
      listSlots: async () => notConfigured,
      chooseSlot: async () => notConfigured,
      moveSlot: async () => notConfigured,
      clearSlot: async () => notConfigured,
      openNannyCall: async () => notConfigured,
      recordOutcome: async () => notConfigured,
      getCallState: async () => notConfigured,
      findOpenCall: async () => notConfigured,
      listOpenCalls: async () => notConfigured,
    });

    const result = await callLayer.getCallState({
      kind: "call",
      positionId: POSITION_ID,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "call-layer-not-configured",
    );
  });

  // 05 §3 rule 6: a stub whose success is indistinguishable from real work is acceptable only where a swap test
  // asserts that behaviour deliberately. `stubCallLayer` holds no calendar, so `listSlots` answers an empty
  // list — unlike `openNannyCall`, which refuses, because "no slots free" is a real answer and "booked" is not.
  // Pinned here (REVIEW-1) so the emptiness is a decision on the record rather than an unexamined quiet
  // success, and so wiring `listSlots` through to `scheduling` later has to change this test on purpose.
  it("answers an empty slot list rather than refusing — the stub holds no calendar", async () => {
    const result = await callLayer.listSlots("matchmaking", {
      from: "2026-01-01T00:00:00+00:00" as never,
      to: "2026-01-08T00:00:00+00:00" as never,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([]);
  });

  it("reads a position call from its mirror, keyed by positionId", async () => {
    const result = await callLayer.getCallState({
      kind: "call",
      positionId: POSITION_ID,
    });

    expect(result.ok && result.value.state).toBe("awaiting-slot");
    expect(result.ok && result.value.type).toBe("matchmaking");
  });

  it("moves the mirror to slot-chosen when a slot is picked", async () => {
    await callLayer.chooseSlot(
      POSITION_ID,
      "default:2026-01-01T10:00:00+00:00",
      undefined,
      ADMIN,
      "key-1",
    );

    const result = await callLayer.getCallState({
      kind: "call",
      positionId: POSITION_ID,
    });

    expect(result.ok && result.value.state).toBe("slot-chosen");
  });

  it("returns a tagged CallResult, so a caller never has to guess the shape", async () => {
    const moved = await callLayer.moveSlot(
      { kind: "call", positionId: POSITION_ID },
      "default:2026-01-01T11:00:00+00:00",
      ADMIN,
    );

    expect(moved.ok && moved.value.kind).toBe("call");
    expect(moved.ok && "state" in moved.value).toBe(true);
  });

  it("derives a nanny-commission call's state from its booking row", async () => {
    const result = await callLayer.getCallState({
      kind: "nanny-call",
      bookingId: BOOKING_ID,
    });

    expect(result.ok && result.value.state).toBe("slot-chosen");
    expect(result.ok && result.value.type).toBe("nanny-commission");
  });

  it("reads a no-answer booking back as awaiting-slot, ready for a new booking", async () => {
    configureCallLayer(
      stubCallLayer({ bookings: { [BOOKING_ID]: bookingWith("no-answer") } }),
    );

    const result = await callLayer.getCallState({
      kind: "nanny-call",
      bookingId: BOOKING_ID,
    });

    expect(result.ok && result.value.state).toBe("awaiting-slot");
  });

  it("reports an unknown subject as NOT_FOUND", async () => {
    const result = await callLayer.getCallState({
      kind: "nanny-call",
      bookingId: "booking-missing" as BookingId,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });
});

describe("the C-row slice registration", () => {
  it("makes advance(C-1) reach the slice without positions ever importing call-layer", async () => {
    const seen: string[] = [];
    const handler: TransitionHandler = {
      id: "C-1",
      run: async (input) => {
        seen.push(input.transition);
        return ok({
          entity: input.entity,
          stage: "slot-chosen" as const,
          version: 1,
          changedAt: AT,
          cascaded: [],
          events: [],
        });
      },
    };
    registerCallLayerSlice([handler]);

    const result = await advance({
      entity: { kind: "call", id: POSITION_ID },
      transition: "C-1",
      actor: ADMIN,
      payload: {},
      expectedFrom: "awaiting-slot",
      idempotencyKey: "key-c1",
    });

    expect(result.ok).toBe(true);
    expect(seen).toEqual(["C-1"]);
  });
});

const notConfigured = err("INTERNAL", "Call layer is not configured", {
  reason: "call-layer-not-configured" as const,
});
