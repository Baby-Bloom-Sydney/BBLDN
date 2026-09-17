// admin/calendar — the other half of S-A-03 (04 §6.4; ADR-074 merged the list and the calendar onto one
// screen). The admin's live availability, the blocks on it, and the slot rules of ADR-076.
//
// The panel owns no data (01 §2.5): it reads `scheduling` and writes through `scheduling`'s own admin methods,
// each of which re-checks the session (03 §3.6: "`auth` (S; `requireRole('admin')` on the admin methods)").
import type { ClientResult } from "@/modules/platform";
import type { ISO, Slot } from "@/modules/shared-types";

export type { AdminPanel, AdminPanelName } from "../types";

/** One day of the grid: the London date, its full name, and every slot on it. */
export type CalendarDay = {
  readonly date: string;
  readonly legend: string;
  readonly slots: ReadonlyArray<CalendarCell>;
};

/**
 * One cell. `blocked` is the ADR-077 state the admin can see and act on; a booked slot is simply absent from
 * `getAvailableSlots`, so `taken` is what the schedule read says about the same start.
 */
export type CalendarCell = {
  readonly slotId: Slot["id"];
  readonly start: ISO;
  readonly time: string;
  readonly state: "open" | "taken" | "displaceable";
  readonly label: string;
};

/** The ADR-076 defaults as the admin sees them, read from the calendar row rather than from `config`. */
export type CalendarRules = {
  readonly slotMinutes: number;
  readonly openFrom: string;
  readonly openTo: string;
  readonly weekdays: string;
  readonly horizonDays: number;
  readonly leadTimeMinutes: number;
  readonly holdMinutes: number;
};

export type CalendarView = {
  readonly days: ReadonlyArray<CalendarDay>;
  readonly rules: CalendarRules;
  /**
   * ★ `unblock` is not built (see `scheduling/lib/scheduling-admin-writes.ts`): no write available to this
   * module lifts a block. The board says so beside the control rather than offering a button that refuses.
   */
  readonly unblockUnavailable: true;
};

export type CalendarRead =
  | { readonly kind: "calendar"; readonly view: CalendarView }
  | { readonly kind: "forbidden" }
  | { readonly kind: "unavailable" };

export type BlockRangeAction = (input: {
  readonly start: ISO;
  readonly end: ISO;
  readonly reason: string;
}) => Promise<ClientResult<{ readonly affected: number }>>;

export type CalendarActions = {
  readonly block: BlockRangeAction;
};
