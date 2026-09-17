// admin/call-queue connector (01 §2.5) — reached through `@/modules/admin`, never deep. S-A-03's list and
// S-A-04's drawer: the read, the four on-behalf levers and the two components.
export type * from "./types";
export { CALL_QUEUE_PANEL } from "./panel";

export { loadCallQueue } from "./lib/load-call-queue";
export { callStateOf } from "./lib/call-state-of";
export { queueGroupOf } from "./lib/queue-group-of";
export { QUEUE_HEADINGS } from "./lib/queue-headings";
export { CALL_TYPE_LABEL } from "./lib/call-type-label";
export { CALL_OUTCOME_LABEL } from "./lib/call-outcome-label";
export { callTimelineRows } from "./lib/call-timeline-rows";

export { recordCallOutcomeAction } from "./actions/record-call-outcome-action";
export { moveCallSlotAction } from "./actions/move-call-slot-action";
export { clearCallSlotAction } from "./actions/clear-call-slot-action";
export { bookCallSlotAction } from "./actions/book-call-slot-action";

export { CallQueue } from "./components/CallQueue";
export { CallItemDrawer } from "./components/CallItemDrawer";
