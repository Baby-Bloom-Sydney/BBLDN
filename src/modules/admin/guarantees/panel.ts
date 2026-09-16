// The guarantees ledger (S-A-29; ADR-088 / 092) — every G1…G5 claim, the condition met, the payout by hand and
// the dates. **No payout automation** (N-2, ADR-022) and **no nanny bonus** (ADR-099); the `nanny-bonus` note is
// reserved and unused.
import type { AdminPanel } from "../types";

export const GUARANTEES_PANEL: AdminPanel = Object.freeze({
  name: "guarantees",
  path: "/admin/guarantees",
  screens: Object.freeze(["S-A-29"]),
});
