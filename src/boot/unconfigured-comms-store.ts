// The `email_logs` / `inbox_messages` port of `comms` (03 §8.1; 02 R-3), fail-closed. The tables exist (S5
// `0011`) but the narrow `Query` surface of 03 §1.4 has no keyed read — `select()` takes no predicate — so
// `findLiveByDedupeKey` / `read` / `cancelByDedupeKey` could only be a scan of an admin-only table under the
// service role. That is not a store, so none of it is pretended: every method answers `store-not-configured`,
// the reason `comms/types.ts` reserves for exactly this. Recorded in the L-007 P1-WIRE entry with its owner.
import { err } from "@/modules/platform";
import type { CommsErrorDetails, CommsStore } from "@/modules/comms";

const refuse = () =>
  err<CommsErrorDetails>("INTERNAL", "Messaging storage is not available", {
    reason: "store-not-configured",
  });

export const unconfiguredCommsStore: CommsStore = Object.freeze({
  findLiveByDedupeKey: async () => refuse(),
  record: async () => refuse(),
  settle: async () => refuse(),
  read: async () => refuse(),
  cancelByDedupeKey: async () => refuse(),
  createInboxMessage: async () => refuse(),
});
