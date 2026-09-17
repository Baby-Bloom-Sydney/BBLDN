// One `events` row → `EventEnvelope` (03 §9.2): the reverse of `event-insert-row.ts`. Pure. The `as` casts are the
// same single seam as the row casts in `auth/lib/supabase-query.ts`: `name` is bounded by the table's CHECK
// (`events_name_check` = the closed `EventName` list) and `props` by the zod schema that ran at `emit`, so the
// column's `Json` is the envelope's props by construction, not by a second validator here.
import type { AppDatabase } from "@/modules/auth";
import type { EventActor, EventEnvelope, Subject } from "@/modules/platform";
import type {
  EventId,
  EventName,
  Instant,
  PositionId,
} from "@/modules/shared-types";

type EventRow = AppDatabase["Tables"]["events"]["Row"];

// The row keeps no `role` for a user actor and no `role` inside an admin's `onBehalfOf` (02 §4.6 `events` has
// `actor_kind` · `actor_id` · `on_behalf_of_id`, nothing more — `event-insert-row.ts` has nowhere to put it), so a
// read-back actor carries the id alone. The `as` says so rather than inventing a role; recorded for the 02 owner in
// the S5b PROGRESS entry as a foundations gap of the read model, not of this file.
function actorOf(row: EventRow): EventActor {
  switch (row.actor_kind) {
    case "user":
      return { kind: "user", id: row.actor_id } as EventActor;
    case "admin":
      return {
        kind: "admin",
        id: row.actor_id,
        ...(row.on_behalf_of_id === null
          ? {}
          : { onBehalfOf: { id: row.on_behalf_of_id } }),
      } as EventActor;
    case "system":
      return { kind: "system", id: row.system_job as never };
    case "visitor":
      return { kind: "visitor", id: row.visitor_id as never };
    case "anonymous":
      return { kind: "anonymous" };
  }
}

function subjectOf(row: EventRow): Subject | undefined {
  if (row.subject_kind === null || row.subject_id === null) return undefined;
  return { kind: row.subject_kind, id: row.subject_id } as Subject;
}

export function eventEnvelopeFromRow(row: EventRow): EventEnvelope {
  const subject = subjectOf(row);
  return Object.freeze({
    id: row.id as EventId,
    name: row.name as EventName,
    ts: row.ts as Instant,
    source: row.source,
    actor: actorOf(row),
    ...(subject === undefined ? {} : { subject }),
    ...(row.position_id === null
      ? {}
      : { positionId: row.position_id as PositionId }),
    props: row.props as never,
    ...(row.attribution === null ? {} : { attribution: row.attribution }),
    ...(row.request_id === null ? {} : { requestId: row.request_id }),
    ...(row.idempotency_key === null
      ? {}
      : { idempotencyKey: row.idempotency_key }),
  }) as EventEnvelope;
}
