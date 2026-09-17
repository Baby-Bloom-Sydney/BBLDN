// admin connector (01 §2.5; 00-glossary §3) — the **eight** panels: `call-queue` · `calendar` ·
// `positions-panel` · `pipeline` · `leads` · `users` · `support` · `guarantees` (ADR-074 added the calendar,
// ADR-088 / S-A-29 the guarantees). Each is a sub-module folder with its own `index.ts`; the outside imports
// `@/modules/admin` and nothing deeper.
//
// `admin` reads through other modules' **connectors only**, never a table directly (fix: A-11 / A-24), and every
// admin action re-checks `is_admin()` with `aal2` through `auth.requireRole('admin')` — the middleware gate is
// the coarse one, not the only one (07 §5.4).
export type * from "./types";

export { ADMIN_PANELS } from "./lib/admin-panels";
export { CALL_QUEUE_PANEL } from "./call-queue";
export { CALENDAR_PANEL } from "./calendar";

// S-A-03 / S-A-04 — the call queue and the one live calendar (`1f`; 04 §6.4). The route files are thin
// (01 §2.5): they gate on the admin role and render these.
export { loadCallQueue } from "./call-queue";
export { CallQueue } from "./call-queue";
export {
  recordCallOutcomeAction,
  moveCallSlotAction,
  clearCallSlotAction,
  bookCallSlotAction,
} from "./call-queue";
export { loadCalendarBoard, CalendarBoard, blockRangeAction } from "./calendar";
export { POSITIONS_PANEL } from "./positions-panel";
export { PIPELINE_PANEL } from "./pipeline";
export { LEADS_PANEL } from "./leads";
export { USERS_PANEL } from "./users";
export { SUPPORT_PANEL } from "./support";
export { GUARANTEES_PANEL } from "./guarantees";
