// admin-verification connector (01 §2.3) — the verification queues and reference for admins. It imports
// `verification` and never `vetting-providers`: every provider call goes through `verification` (03 §4.2).
//
// **Types only in this unit.** The queue reads and the per-tab decision actions touch evidence and the
// signed-URL opens that `07 §4.32` audits, so they belong with the ADR-117 Tier A verification insides and
// are built and reviewed there. See README "Held back".
export type * from "./types";
