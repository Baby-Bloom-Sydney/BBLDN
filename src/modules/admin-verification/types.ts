// 01 §2.3 + 03 §4.3 — the admin verification queues and reference (S-A-16). It reaches providers **through**
// `verification`, never directly (03 §4.2), and it decorates rather than decides.
//
// The queue's own connector surface is not specified by the foundations beyond the three tabs and the two
// filters below, so this unit invents no method beyond them; the screen contract is `04 §5` (S-A-16), which
// this unit does not read. Recorded as a gap in the module README.
import type { UserId } from "@/modules/shared-types";
import type { VerificationSection } from "@/modules/verification";

/** 03 §4.3: "S-A-16 shows all three tabs". */
export type QueueTab = VerificationSection;

/** 03 §4.3: the queue "lists sections in `needs-admin` or stale `pending`". */
export type QueueFilter = "needs-admin" | "stale-pending";

export type QueueQuery = {
  readonly tab: QueueTab;
  readonly filter: QueueFilter;
};

/** Ids only — the admin panel decorates them from the `auth` / `verification` connectors (03 §3.6 pattern). */
export type QueueEntry = {
  readonly nannyId: UserId;
  readonly tab: QueueTab;
  readonly filter: QueueFilter;
};
