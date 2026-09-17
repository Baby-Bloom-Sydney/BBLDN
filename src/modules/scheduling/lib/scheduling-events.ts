// 03 §3.6 "**Events emitted**" — the five this contract names as `scheduling`'s own: `booking.held` ·
// `booking.displaced` · `booking.displacement-failed` · `booking.blocked-over` · `availability.changed`.
//
// **Whose they are, read carefully, because `1f`'s handover read it the other way.** §3.6 lists these five under
// the `scheduling` contract and then adds the exception: "Booking creation, reschedule, cancel, done and
// no-answer are **call facts** emitted by `call-layer` as `call.*` — `scheduling` writes the row, the caller
// emits." The exception names the `call.*` family, not this one. §3.5 sequence 3 settles it in passing: it has
// `booking.displaced` firing "then `call.slot-chosen` (parent, **from `call-layer`**)" — the attribution is on
// the second event because the first is not `call-layer`'s. And `scheduling` may import `platform` (§3.6's own
// allowed-import line), which is the only reason it *can* emit.
//
// Emitted **outside** any transaction the write ran in, and never allowed to fail the write: a booking that
// exists and an event that did not land is a reporting gap, while a booking that was rolled back because the
// event log was busy is a family without a call. `Events.emit` answers a `Result` and it is deliberately
// dropped here — `platform` has already logged it (03 §9.2).
import { Events } from "@/modules/platform";
import type { Block, Booking, ISO } from "@/modules/shared-types";
import type { Actor, BookingId, RuleId } from "@/modules/shared-types";

type Emit = Parameters<typeof Events.emit>[0];

const subjectOf = (booking: Booking) =>
  booking.subject.kind === "position"
    ? { kind: "position" as const, id: booking.subject.positionId }
    : { kind: "booking" as const, id: booking.id };

const envelope = (
  name: Emit["name"],
  actor: Actor,
  booking: Booking,
  props: Readonly<Record<string, unknown>>,
): Emit =>
  ({
    name,
    actor,
    subject: subjectOf(booking),
    ...(booking.subject.kind === "position"
      ? { positionId: booking.subject.positionId }
      : {}),
    props,
  }) as Emit;

/** §3.6 `booking.held` — a slot taken out of the pool while a family decides (§3.3 I-10's held row). */
export const schedulingEvents = Object.freeze({
  held: (actor: Actor, booking: Booking): void => {
    void Events.emit(
      envelope("booking.held", actor, booking, {
        bookingId: booking.id,
        kind: booking.kind,
        slotAt: booking.start,
      }),
    );
  },

  /**
   * §3.6 `booking.displaced` — the nanny whose call moved so a family could take her slot (I-2). Without it a
   * displaced nanny is never told, which is half of I-2; the message itself is `call-layer`'s (§3.5 seq 3), and
   * this is the record the message is chased from.
   */
  displaced: (
    actor: Actor,
    moved: Booking,
    displacedBy: BookingId,
    from: ISO,
  ): void => {
    void Events.emit(
      envelope("booking.displaced", actor, moved, {
        bookingId: moved.id,
        kind: moved.kind,
        slotAt: moved.start,
        from,
        to: moved.start,
        displacedBy,
      }),
    );
  },

  /** §3.6 `booking.displacement-failed` — I-3's fallback fired: her call was cancelled, not moved. */
  displacementFailed: (
    actor: Actor,
    moved: Booking,
    displacedBy: BookingId,
    from: ISO,
  ): void => {
    void Events.emit(
      envelope("booking.displacement-failed", actor, moved, {
        bookingId: moved.id,
        kind: moved.kind,
        from,
        displacedBy,
      }),
    );
  },

  /**
   * §3.6 `booking.blocked-over` — an admin blocked a range a booking sits inside. I-4 / ADR-077: a block
   * **flags**, it never cancels, so this is the notification that the admin has calls to move by hand.
   */
  blockedOver: (actor: Actor, affected: Booking, blockId: string): void => {
    void Events.emit(
      envelope("booking.blocked-over", actor, affected, {
        bookingId: affected.id,
        kind: affected.kind,
        slotAt: affected.start,
        blockId,
      }),
    );
  },

  /** §3.6 `availability.changed` — a rule or a block came into force, or went out of it. */
  availabilityChanged: (
    actor: Actor,
    change: "created" | "removed",
    ref: { readonly ruleId?: RuleId; readonly blockId?: Block["id"] },
  ): void => {
    void Events.emit({
      name: "availability.changed",
      actor,
      props: {
        change,
        ...(ref.ruleId === undefined ? {} : { ruleId: ref.ruleId }),
        ...(ref.blockId === undefined ? {} : { blockId: ref.blockId }),
      },
    } as Emit);
  },
});
