// `BookInput` (03 §3.2) → `book_slot()`'s eleven arguments (02 §7). The cap is read from config here rather
// than inside the function, because `0009` deliberately refuses a null or negative `p_displacement_cap`: the
// value is a product decision (I-13, `SCHEDULING.maxDisplacementsPerNannyPerDay`) and the database will not
// invent one.
import { SCHEDULING } from "@/modules/config";
import type { Database, ISO, Uuid } from "@/modules/shared-types";
import type { BookInput } from "../types";
import { actorColumns } from "./actor-columns";
import { subjectColumns } from "./subject-columns";

type BookSlotArgs = Database["public"]["Functions"]["book_slot"]["Args"];

export function bookSlotArgs(input: {
  readonly input: BookInput;
  readonly calendarId: Uuid;
  readonly start: ISO;
  readonly displaceTo: ISO | null;
}): BookSlotArgs {
  const actor = actorColumns(input.input.actor);
  const subject = subjectColumns(input.input.subject);
  return {
    p_calendar_id: input.calendarId,
    p_kind: input.input.kind,
    p_subject_type: subject.subject_type,
    p_subject_id: subject.subject_id,
    p_start_at: input.start,
    p_actor_role: actor.booked_by_role,
    p_actor_user_id: actor.booked_by_user_id ?? "",
    p_idempotency_key: input.input.idempotencyKey,
    p_displacement_cap: SCHEDULING.maxDisplacementsPerNannyPerDay,
    ...(input.input.holdId === undefined
      ? {}
      : { p_hold_id: input.input.holdId as string }),
    ...(input.displaceTo === null ? {} : { p_displace_to: input.displaceTo }),
  };
}
