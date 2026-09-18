// The families, and only as far as the matching screens need them (08 §3 is a *supply* question; the demand
// side is here to give the supply something to be matched against).
//
// Two of them, each with one live position — I-1 allows a parent exactly one:
//
//   - **the demo family**: an OPEN position in the first seeded area, so a quick match has a full set of
//     candidates within reach rather than one lonely card;
//   - **the held family**: a CONNECTING position carrying one connection that is `held_for_verification`
//     (ADR-158) against a nanny who is in the pool but not yet L4. The silent hold is the likeliest
//     launch-week collision (08 §3.4) and it is invisible by construction, so a database in which nobody is
//     held is a database in which nothing about it can be looked at.
import type { Client } from "pg";
import { syntheticPerson } from "./synthetic-person.ts";
import { writePerson } from "./write-person.ts";
import type { SeedArea } from "./types.ts";

export type ParentWorld = {
  readonly parents: number;
  readonly positions: number;
  readonly connections: number;
  readonly heldConnections: number;
};

export async function writeParentWorld(
  db: Client,
  area: SeedArea,
  heldNannyId: string,
): Promise<ParentWorld> {
  const demo = await writeParent(db, 0, area);
  await writePosition(db, demo, area, "OPEN");
  const holder = await writeParent(db, 1, area);
  const position = await writePosition(db, holder, area, "CONNECTING");
  await db.query(
    `insert into public.connection_requests
        (position_id, nanny_id, parent_id, stage, origin, held_for_verification, held_at)
     values ($1, $2, $3, 'ACCEPTED', 'parent_request', true, now())`,
    [position, heldNannyId, holder.parentId],
  );
  return Object.freeze({
    parents: 2,
    positions: 2,
    connections: 1,
    heldConnections: 1,
  });
}

type SeededParent = { readonly parentId: string; readonly userId: string };

async function writeParent(
  db: Client,
  index: number,
  area: SeedArea,
): Promise<SeededParent> {
  const person = syntheticPerson("parent", index);
  const userId = await writePerson(db, person, "parent", area);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.parents (user_id, signup_source) values ($1, 'cold') returning id`,
    [userId],
  );
  return { parentId: rows[0].id, userId };
}

async function writePosition(
  db: Client,
  parent: SeededParent,
  area: SeedArea,
  stage: "OPEN" | "CONNECTING",
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.nanny_positions
        (parent_id, source, stage, title, description, district, area,
         hours_per_week, hourly_rate_pence, published_at)
     values ($1, 'in_app', $2, $3, $4, $5, $6, 30, 2000, now()) returning id`,
    [
      parent.parentId,
      stage,
      `Seeded position in ${area.area}`,
      "A seeded position for local development.",
      area.district,
      area.area,
    ],
  );
  await db.query(
    `insert into public.position_children (position_id, child_label, age_months, display_order)
     values ($1, 'A', 18, 1)`,
    [rows[0].id],
  );
  return rows[0].id;
}
