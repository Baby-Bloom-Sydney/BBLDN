// The seed itself: a plan in, a report out, one `pg` client, no connection management and no `process` — so
// the runner owns the transaction and `int.seed` can apply the whole thing inside one it rolls back.
//
// Order matters exactly once: the admin exists before any nanny, because an L4 Update Service check and a
// recorded decision both name the admin who made them (0023's `dbs_update_service_checked_by` and
// `vetting_submissions.decided_by`), and a seed that left those null would quietly under-populate the one
// audit answer REVIEW-3 went to the trouble of making durable.
import type { Client } from "pg";
import { syntheticPerson } from "./synthetic-person.ts";
import { writeParentWorld } from "./write-parent-world.ts";
import { writePerson } from "./write-person.ts";
import { writeSeededNanny } from "./write-seeded-nanny.ts";
import type { NannyState, SeedPlan, SeedReport } from "./types.ts";

/** The pool floor the product calls "in matching" — a state at or above it joins the candidate set. */
const IN_POOL: ReadonlyArray<NannyState> = Object.freeze([
  "level-3",
  "level-4",
  "held",
]);

/** A running index, so every seeded person gets a distinct id, address, mobile and certificate number. */
type Counter = { next: number };

export async function applySeed(
  db: Client,
  plan: SeedPlan,
): Promise<SeedReport> {
  const adminUserId = await writePerson(
    db,
    syntheticPerson("admin", 0),
    "admin",
    null,
  );
  const counter: Counter = { next: 0 };
  await writePool(db, plan, adminUserId, counter);
  const byState = await writeStates(db, plan, adminUserId, counter);
  await writeIsolated(db, plan, adminUserId, counter);

  const held = byState.get("held");
  if (held === undefined)
    throw new Error(
      "seed: the plan has no `held` nanny to hold a connection on",
    );
  const world = await writeParentWorld(db, plan.areas[0], held);

  return Object.freeze({
    areas: plan.areas,
    counts: Object.freeze({
      admins: 1,
      parents: world.parents,
      poolNannies: plan.areas.length * plan.poolPerArea,
      stateNannies: plan.states.length,
      stateNanniesInPool: plan.states.filter((state) => IN_POOL.includes(state))
        .length,
      isolatedNannies: 1,
      positions: world.positions,
      connections: world.connections,
      heldConnections: world.heldConnections,
    }),
  });
}

/** 08 §3.4's per-area floor: supply is only supply where a family can reach it. */
async function writePool(
  db: Client,
  plan: SeedPlan,
  adminUserId: string,
  counter: Counter,
): Promise<void> {
  for (const area of plan.areas)
    for (let k = 0; k < plan.poolPerArea; k += 1)
      await writeSeededNanny(db, {
        index: counter.next++,
        area,
        state: k < plan.poolAtL4 ? "level-4" : "level-3",
        adminUserId,
        isolated: false,
      });
}

/** One per state the admin queue and the level model have to tell apart. */
async function writeStates(
  db: Client,
  plan: SeedPlan,
  adminUserId: string,
  counter: Counter,
): Promise<Map<NannyState, string>> {
  const byState = new Map<NannyState, string>();
  for (const [i, state] of plan.states.entries()) {
    const seeded = await writeSeededNanny(db, {
      index: counter.next++,
      area: plan.areas[i % plan.areas.length],
      state,
      adminUserId,
      isolated: false,
    });
    byState.set(state, seeded.nannyId);
  }
  return byState;
}

/** ADR-017 / I-5: created by a child invite, out of every candidate set until she applies from her portal. */
async function writeIsolated(
  db: Client,
  plan: SeedPlan,
  adminUserId: string,
  counter: Counter,
): Promise<void> {
  await writeSeededNanny(db, {
    index: counter.next++,
    area: plan.areas[0],
    state: "level-2",
    adminUserId,
    isolated: true,
  });
}
