// admin/calendar connector (01 §2.5) — reached through `@/modules/admin`, never deep. The other half of S-A-03
// (ADR-074): the live availability board, the ADR-076 rules, and the block that flags rather than cancels.
export type * from "./types";
export { CALENDAR_PANEL } from "./panel";

export { loadCalendarBoard } from "./lib/load-calendar-board";
export { calendarDays } from "./lib/calendar-days";
export { blockRangeAction } from "./actions/block-range-action";
export { CalendarBoard } from "./components/CalendarBoard";
