// 03 §2.5 `Actor` → 02 §4.4 row 4's `booked_by_role` / `booked_by_user_id`. The role column is `actor_role`
// (`parent · nanny · admin · system`), which is not quite `Actor.kind`: a user carries their own role, an admin
// is `'admin'`, and a named job is `'system'` with no user behind it.
//
// An admin acting **on behalf of** a parent is still recorded as the admin here (P-1, ADR-001: the same move,
// with the admin named). The party is carried on the event's `onBehalfOf`, which is where 07 §5.4 row 6 puts it.
import type { Actor, Database } from "@/modules/shared-types";

type ActorColumns = {
  readonly booked_by_role: Database["public"]["Enums"]["actor_role"];
  readonly booked_by_user_id: string | null;
};

export function actorColumns(actor: Actor): ActorColumns {
  if (actor.kind === "admin")
    return { booked_by_role: "admin", booked_by_user_id: actor.id };
  if (actor.kind === "system")
    return { booked_by_role: "system", booked_by_user_id: null };
  return { booked_by_role: actor.role, booked_by_user_id: actor.id };
}
