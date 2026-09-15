// 03 §9.2 rule 1 — every sink after the event-log runs post-commit, awaited with its timeout; a failure is one
// `warn` line with `alert: ALERT_EVENT_SINK_FAILED` (01 §7), never a throw, never a retry. Sinks run in parallel.
import type { Log } from "../../log/types";
import type { EventEnvelope, FanOutOutcome, Sink } from "../types";
import { withTimeout } from "./with-timeout";

async function deliver(
  envelope: EventEnvelope,
  sink: Sink,
  log: Log,
  defaultTimeoutMs: number,
): Promise<FanOutOutcome> {
  const result = await withTimeout(
    () => sink.handle(envelope),
    sink.timeoutMs ?? defaultTimeoutMs,
  );
  if (result.ok) return { id: sink.id, ok: true };
  const reason =
    result.error.details?.reason === "timeout" ? "timeout" : result.error.code;
  log.warn("event sink failed", {
    alert: "ALERT_EVENT_SINK_FAILED",
    sink: sink.id,
    reason,
    eventName: envelope.name,
    eventId: envelope.id,
    requestId: envelope.requestId,
    errorCode: result.error.code,
    cause: result.error.cause,
  });
  return { id: sink.id, ok: false };
}

export function fanOut(
  envelope: EventEnvelope,
  sinks: ReadonlyArray<Sink>,
  deps: { readonly log: Log; readonly defaultTimeoutMs: number },
): Promise<ReadonlyArray<FanOutOutcome>> {
  return Promise.all(
    sinks.map((sink) =>
      deliver(envelope, sink, deps.log, deps.defaultTimeoutMs),
    ),
  );
}
