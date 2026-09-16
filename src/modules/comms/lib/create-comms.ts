// 03 §8.1 — the connector over its four injected ports. Comms owns the seam and no business rule: which
// template fires when belongs to the calling module (03 §8.3), and what a template says to its template file.
import { nowInstant } from "@/modules/platform";
import type { MessageId } from "@/modules/shared-types";
import type { Comms, CommsDeps } from "../types";
import { deliverMessage } from "./deliver-message";

export function createComms(deps: CommsDeps): Comms {
  const clock = deps.clock ?? nowInstant;
  return Object.freeze({
    send: (message) => deliverMessage(deps, clock, message, "sent"),
    schedule: (message) => deliverMessage(deps, clock, message, "queued"),
    sendMany: async (messages) => {
      // Sequential and immutable: chunking by provider batch size is the Resend provider's business (03 §8.1).
      let sent: ReadonlyArray<MessageId> = Object.freeze([]);
      for (const message of messages) {
        const one = await deliverMessage(deps, clock, message, "sent");
        if (!one.ok) return one;
        sent = Object.freeze([...sent, one.value]);
      }
      return { ok: true, value: sent };
    },
    cancel: (dedupeKey) => deps.store.cancelByDedupeKey(dedupeKey),
    status: (messageId) => deps.store.read(messageId),
    createInboxMessage: (msg, opts) => deps.store.createInboxMessage(msg, opts),
  });
}
