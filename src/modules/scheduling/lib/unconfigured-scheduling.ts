// The fail-closed default. There is no `bookings` / `availability_rules` store on `main` yet, so the
// module-level `scheduling` refuses rather than answering from nowhere (01 §4a rule 2). Boot — or a test —
// installs `createSchedulingStub()` or the real inside through `configureScheduling`.
import { err } from "@/modules/platform";
import type { Scheduling, SchedulingErrorDetails } from "../types";

const refuse = () =>
  err<SchedulingErrorDetails>("INTERNAL", "The calendar is not available", {
    reason: "SCHEDULING_NOT_CONFIGURED",
  });

export const unconfiguredScheduling: Scheduling = Object.freeze({
  getAvailableSlots: async () => refuse(),
  hold: async () => refuse(),
  release: async () => refuse(),
  book: async () => refuse(),
  reschedule: async () => refuse(),
  cancel: async () => refuse(),
  markDone: async () => refuse(),
  markNoAnswer: async () => refuse(),
  getBooking: async () => refuse(),
  listForSubject: async () => refuse(),
  setAvailabilityRule: async () => refuse(),
  removeAvailabilityRule: async () => refuse(),
  block: async () => refuse(),
  unblock: async () => refuse(),
  listSchedule: async () => refuse(),
  expireHolds: async () => refuse(),
});
