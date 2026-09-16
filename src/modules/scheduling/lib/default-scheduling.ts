// The module-level `scheduling` its three importers hold (03 §3.2: `call-layer` · `admin` ·
// `admin-on-behalf`). It delegates to the registry so a later `configureScheduling` wins.
import type { Scheduling } from "../types";
import { SCHEDULING_REGISTRY } from "./scheduling-registry";

export const scheduling: Scheduling = Object.freeze({
  getAvailableSlots: (query) =>
    SCHEDULING_REGISTRY.get().getAvailableSlots(query),
  hold: (slotId, actor) => SCHEDULING_REGISTRY.get().hold(slotId, actor),
  release: (holdId, actor) => SCHEDULING_REGISTRY.get().release(holdId, actor),
  book: (input) => SCHEDULING_REGISTRY.get().book(input),
  reschedule: (bookingId, slotId, actor) =>
    SCHEDULING_REGISTRY.get().reschedule(bookingId, slotId, actor),
  cancel: (bookingId, actor, reason) =>
    SCHEDULING_REGISTRY.get().cancel(bookingId, actor, reason),
  markDone: (bookingId, outcome, actor) =>
    SCHEDULING_REGISTRY.get().markDone(bookingId, outcome, actor),
  markNoAnswer: (bookingId, nextAttemptAt, actor) =>
    SCHEDULING_REGISTRY.get().markNoAnswer(bookingId, nextAttemptAt, actor),
  getBooking: (bookingId, actor) =>
    SCHEDULING_REGISTRY.get().getBooking(bookingId, actor),
  listForSubject: (subject) =>
    SCHEDULING_REGISTRY.get().listForSubject(subject),
  setAvailabilityRule: (rule, actor) =>
    SCHEDULING_REGISTRY.get().setAvailabilityRule(rule, actor),
  removeAvailabilityRule: (ruleId, actor) =>
    SCHEDULING_REGISTRY.get().removeAvailabilityRule(ruleId, actor),
  block: (range, reason, actor) =>
    SCHEDULING_REGISTRY.get().block(range, reason, actor),
  unblock: (blockId, actor) =>
    SCHEDULING_REGISTRY.get().unblock(blockId, actor),
  listSchedule: (range, actor, filter) =>
    SCHEDULING_REGISTRY.get().listSchedule(range, actor, filter),
  expireHolds: (now) => SCHEDULING_REGISTRY.get().expireHolds(now),
});
