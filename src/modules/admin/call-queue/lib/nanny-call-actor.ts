// A nanny-commission call has no family behind it, and `onBehalfOf` is still required on every lever (07 §5.4
// row 6; `admin-on-behalf` refuses `VALIDATION` without it). The nanny is the party, so the lever runs on her
// behalf — the gate replaces the id with the session's admin and keeps this `onBehalfOf` (FIX-1).
import type { Actor, AdminId, UserId } from "@/modules/shared-types";

export function nannyCallActor(nannyId: UserId): Actor {
  return Object.freeze({
    kind: "admin",
    id: "session" as AdminId,
    onBehalfOf: { role: "nanny" as const, id: nannyId },
  });
}
