// Which key an `EventsQuery` (03 §9.2) can be read by: the position (`events_position_idx`) or the subject's id
// (`events_subject_idx`) — the two keyed access paths 02 §4.6 indexes. `null` = no key, and the store refuses
// rather than scan. Pure.
import type { EventsQuery } from "@/modules/platform";

export type EventsQueryKey = {
  readonly column: "position_id" | "subject_id";
  readonly value: string;
};

export function eventsQueryKey(q: EventsQuery): EventsQueryKey | null {
  if (q.positionId !== undefined)
    return { column: "position_id", value: q.positionId };
  if (q.subject !== undefined)
    return { column: "subject_id", value: q.subject.id };
  return null;
}
