// admin/calendar connector (01 §2.5) — reached through `@/modules/admin`, never deep. The panel descriptor is the
// only runtime surface today: this panel reads other modules' connectors and owns no data of its own.
export type * from "./types";
export { CALENDAR_PANEL } from "./panel";
