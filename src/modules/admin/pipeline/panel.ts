// The funnel workbench (S-A-12) — the nightly `pipeline_snapshots` rows plus live counts, read through
// `platform`'s `queryEvents` / `countByName` and 02's views, never by querying tables here (fix: A-24).
import type { AdminPanel } from "../types";

export const PIPELINE_PANEL: AdminPanel = Object.freeze({
  name: "pipeline",
  path: "/admin/pipeline",
  screens: Object.freeze(["S-A-12"]),
});
