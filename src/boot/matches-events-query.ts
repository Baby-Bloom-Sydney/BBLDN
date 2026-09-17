// The in-memory half of `EventsQuery` (03 §9.2) — the same predicate `memoryEventLogStore` applies, so the real
// store and the stub agree on every filter once the keyed rows are in hand. Pure.
import type { EventEnvelope, EventsQuery } from "@/modules/platform";

export function matchesEventsQuery(
  row: EventEnvelope,
  q: EventsQuery,
): boolean {
  if (q.names !== undefined && !q.names.includes(row.name)) return false;
  if (q.positionId !== undefined && row.positionId !== q.positionId)
    return false;
  if (
    q.subject !== undefined &&
    (row.subject?.kind !== q.subject.kind || row.subject.id !== q.subject.id)
  )
    return false;
  if (q.from !== undefined && row.ts < q.from) return false;
  if (q.to !== undefined && row.ts >= q.to) return false;
  return true;
}
