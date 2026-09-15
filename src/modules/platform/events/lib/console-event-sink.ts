// 03 §9.5 `console` sink — "one structured log line per envelope through platform.log" (dev + test). Ids and
// names only: props are never written to the log stream (they are the row's business, not ops').
import type { Log } from "../../log/types";
import type { Sink } from "../types";
import { ok } from "../../lib/ok";

export function consoleEventSink(log: Log): Sink {
  return Object.freeze({
    id: "console" as const,
    handle: async (envelope) => {
      log.info("event", {
        eventName: envelope.name,
        eventId: envelope.id,
        source: envelope.source,
        actorKind: envelope.actor.kind,
        subjectKind: envelope.subject?.kind,
        positionId: envelope.positionId,
        requestId: envelope.requestId,
        idempotencyKey: envelope.idempotencyKey,
      });
      return ok(undefined);
    },
  });
}
