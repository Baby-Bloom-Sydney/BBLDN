// The nanny contacts worklist (S-A-13) — tabs, filters, the contact drawer, the verification breakdown and the
// contact log.
import type { AdminPanel } from "../types";

export const LEADS_PANEL: AdminPanel = Object.freeze({
  name: "leads",
  path: "/admin/leads",
  screens: Object.freeze(["S-A-13"]),
});
