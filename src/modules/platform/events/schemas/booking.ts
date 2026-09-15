// 03 §9.3 Booking (5) — ADR-074: `scheduling`. One `displaced` schema (fix: A-26).
import { z } from "zod";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const kind = z.enum(ENUMS.call_type);

export const BOOKING_EVENT_SCHEMAS = Object.freeze({
  "booking.held": P.props({ bookingId: P.id, kind, slotAt: P.instant }),
  "booking.displaced": P.props({
    bookingId: P.id,
    kind,
    slotAt: P.instant,
    from: P.instant,
    to: P.instant,
    displacedBy: P.id,
  }),
  "booking.displacement-failed": P.props({
    bookingId: P.id,
    kind,
    slotAt: P.instant.optional(),
    from: P.instant,
    displacedBy: P.id,
  }),
  "booking.blocked-over": P.props({
    bookingId: P.id,
    kind,
    slotAt: P.instant,
    blockId: P.id,
  }),
  "availability.changed": P.props({
    ruleId: P.id.optional(),
    blockId: P.id.optional(),
    change: z.enum(["created", "removed"]),
  }),
});
