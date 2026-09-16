// The manual control panel (S-A-05 / S-A-06) — every position by stage, the pre-check view, connections by origin,
// placement and bundle state, and the on-behalf levers (S-A-07…S-A-11) through `admin-on-behalf`.
import type { AdminPanel } from "../types";

export const POSITIONS_PANEL: AdminPanel = Object.freeze({
  name: "positions-panel",
  path: "/admin/positions",
  screens: Object.freeze(["S-A-05", "S-A-06"]),
});
