// The call queue (S-A-03 / S-A-04) — every call by booked time, the `awaiting-slot` group, the call item drawer
// and the on-behalf slot controls. Reads `scheduling.listSchedule` and `call-layer` through their connectors;
// `scheduling` returns ids and this panel decorates them (03 §3.2 R3).
import type { AdminPanel } from "../types";

export const CALL_QUEUE_PANEL: AdminPanel = Object.freeze({
  name: "call-queue",
  path: "/admin/calls",
  screens: Object.freeze(["S-A-03", "S-A-04"]),
});
