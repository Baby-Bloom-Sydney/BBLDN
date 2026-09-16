// User management and the money views (S-A-14 / 15 / 16 / 18 / 19 / 22) — the user drawer, the verification queue,
// the bundle ledger, the per-family money view and view-as-user. The money rows read `payments` only (03 §5.5).
import type { AdminPanel } from "../types";

export const USERS_PANEL: AdminPanel = Object.freeze({
  name: "users",
  path: "/admin/users",
  screens: Object.freeze([
    "S-A-14",
    "S-A-15",
    "S-A-16",
    "S-A-18",
    "S-A-19",
    "S-A-22",
  ]),
});
