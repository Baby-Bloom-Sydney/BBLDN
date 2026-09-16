// `EventEnvelope` (03 §9.2) → one `events` row (02 §4.6; migration `0011`). Pure. The actor's shape decides the
// actor columns: a user or admin carries `actor_id` (+ `on_behalf_of_id` for an admin acting on behalf — 07 §5.4
// row 6), a system actor is its job name, a visitor is the consent-gated `visitor_id` (07 §2.9), anonymous is
// nothing. `from_stage` / `to_stage` / `transition_id` are the stage RPC's to write (03 §2.5), not this row's.
import type { AppDatabase } from "@/modules/auth";
import type { EventActor, EventEnvelope } from "@/modules/platform";
import type { Json } from "@/modules/shared-types";

export type EventInsertRow = AppDatabase["Tables"]["events"]["Insert"];

/**
 * The one place an envelope's typed props become the column's `Json`. The zod schema already validated the
 * shape at `emit` (`validateEmitInput`), and every props schema is `.strict()` over ids and plain scalars, so
 * the round trip through JSON changes nothing — it is done for real rather than asserted so a non-plain value
 * (a `Date`, a `Map`) becomes what PostgREST would have received anyway, never a type-level lie.
 */
const toJson = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;

function actorColumns(
  actor: EventActor,
): Pick<
  EventInsertRow,
  "actor_kind" | "actor_id" | "on_behalf_of_id" | "system_job" | "visitor_id"
> {
  switch (actor.kind) {
    case "user":
      return { actor_kind: "user", actor_id: actor.id };
    case "admin":
      return {
        actor_kind: "admin",
        actor_id: actor.id,
        on_behalf_of_id: actor.onBehalfOf?.id ?? null,
      };
    case "system":
      return { actor_kind: "system", system_job: actor.id };
    case "visitor":
      return { actor_kind: "visitor", visitor_id: actor.id };
    case "anonymous":
      return { actor_kind: "anonymous" };
  }
}

export function eventInsertRow(envelope: EventEnvelope): EventInsertRow {
  return Object.freeze({
    id: envelope.id,
    name: envelope.name,
    ts: envelope.ts,
    source: envelope.source,
    ...actorColumns(envelope.actor),
    subject_kind: envelope.subject?.kind ?? null,
    subject_id: envelope.subject?.id ?? null,
    position_id: envelope.positionId ?? null,
    props: toJson(envelope.props),
    attribution:
      envelope.attribution === undefined ? null : toJson(envelope.attribution),
    request_id: envelope.requestId ?? null,
    idempotency_key: envelope.idempotencyKey ?? null,
  });
}
