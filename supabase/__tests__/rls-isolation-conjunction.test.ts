// `int.rls-isolation-conjunction` — **a pin, and the state it pins is a live read of other people's
// children.** REVIEW-3 (ADR-123 checkpoint over 2a · S5e · 2b · 2g).
//
// ADR-147 rules that `nannies.is_isolated` is "the record of not having applied" rather than a visibility
// switch, and rests the whole safety of that on one stated conjunction. `0021`'s own header says it verbatim:
//
//   "Pool visibility is the conjunction `NOT is_isolated AND verification_level >= config` in every read
//    (`nannies_matching_idx`, `is_active_nanny()`, `nanny_public`), so a Path-A nanny at level 0 and an
//    invited nanny who has applied at level 0 are equally invisible; the flag records *having applied*."
//
// It is true of two of the three reads it names. `nanny_public` (`0016:31-66`) carries both terms, and
// `nannies_matching_idx` (`0005:78`) is a partial index on `profile_visible and not is_isolated` keyed by
// `verification_level`, so every query that uses it supplies the level. **`is_active_nanny()` (`0005:153-164`)
// carries no level term at all** — it is `not is_isolated and suspended_at is null` and nothing else.
//
// That matters because `is_active_nanny()` is the *inbound* half of the marketplace: seven RLS policies key
// on it — `0006:240` (`nanny_positions` board), `0006:261` (`position_children`), `0006:285`
// (`position_schedule`) and `0016:211,235,247,259` — and `0016`'s own comment calls `position_children
// .needs_details` "potentially Art 9 child health data". Before `2a` no road in the London tree ever set
// `is_isolated` to `false`, so the missing term cost nothing. `2a` built the road: ADR-147 consequence (1)
// makes `/apply` create the account with `is_isolated = false` **explicitly**
// (`sign-up-nanny-action.ts:123` — `isolated: path !== "apply"`), and `nannies.verification_level` defaults
// `L0_SIGNED_UP` (`0005:50`). So anyone who completes the public funnel — no document, no identity check, no
// admin — reads every OPEN / CONNECTING position and every child's care-needs text on it.
//
// **Flipped by `2c` (0023, ADR-162):** the predicate is `nanny_visible()`, read by `is_active_nanny()`, the view and
// the index alike. The header below is kept as the record of what was measured.
//
// **Why this was pinned and not fixed (REVIEW-3).** The fix is one predicate in a new migration:
//
//   and n.verification_level in ('L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED')
//
// regenerated from `MATCHING.minVerificationLevel` the way `0016`'s view is. But `0005`'s own comment ties
// `is_active_nanny()` to "I-5 / AC-N-22..26 — a nanny who may see the marketplace **at all**", which is a
// different question from pool visibility, and the level a nanny must reach before the jobs board opens to
// her is `2c`'s (level derivation) and 04 §4.2 b5's, not a review agent's to decide. Migrations are also
// merged by the time this sweep runs. So: the documented behaviour is pinned RED, and the ruling is asked
// for. ADR-123 rule 2.
//
// The first case is the exposure itself. The second is the same statement in the form `0021`'s header makes
// it, so whichever the owner fixes, both turn green together.
//
// One transaction, rolled back, like `int.rls`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { asRole, seedFixtures, type Fixtures } from "./rls-fixtures";

let db: Client;
let f: Fixtures;

/** The account `/apply` creates: a real session, not isolated, and at the level column's own default. */
const APPLIED = "000000af-0000-4000-8000-000000000000";

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  f = await seedFixtures(db);
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             'applied-level-0@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [APPLIED],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'nanny')`,
    [APPLIED],
  );
  await db.query(
    `insert into public.user_profiles (user_id, first_name, last_name, email, district, area)
     values ($1, 'Applied', 'Nanny', 'applied-level-0@example.test', 'SW4', 'Clapham')`,
    [APPLIED],
  );
  // `create_nanny_account(p_isolated => false)` on the `/apply` road, reduced to the two columns that
  // decide this: `verification_level` and `profile_visible` are left at their defaults, as the definer
  // leaves them (`0021` writes neither).
  await db.query(
    `insert into public.nannies (user_id, is_isolated) values ($1, false)`,
    [APPLIED],
  );
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rls — ADR-147's conjunction on the inbound half of the marketplace", () => {
  it("the account is in exactly the state /apply creates: applied, unverified, not publicly visible", async () => {
    const rows = await asRole<{
      level: string;
      isolated: boolean;
      visible: boolean;
    }>(
      db,
      APPLIED,
      `select verification_level as level, is_isolated as isolated, profile_visible as visible
         from public.nannies where user_id = auth.uid()`,
    );
    expect(rows[0]).toEqual({
      level: "L0_SIGNED_UP",
      isolated: false,
      visible: false,
    });
    // And she is correctly absent from the *outbound* surface — the half the conjunction does hold for.
    const mine = await db.query<{ id: string }>(
      "select id from public.nannies where user_id = $1",
      [APPLIED],
    );
    const pool = await asRole<{ nanny_id: string }>(
      db,
      null,
      "select nanny_id from public.nanny_public",
    );
    expect(pool.map((r) => r.nanny_id)).not.toContain(mine.rows[0].id);
    expect(pool.map((r) => r.nanny_id)).toContain(f.nannyVisibleId);
  });

  it("an applied, level-0 nanny reads no open position and no child's care needs (ADR-147; 0021 header; owner: 02 §4.2 / 03 §2.6 I-5 with `2c`)", async () => {
    const positions = await asRole<{ id: string }>(
      db,
      APPLIED,
      "select id from public.nanny_positions",
    );
    const children = await asRole<{ needs_details: string | null }>(
      db,
      APPLIED,
      "select needs_details from public.position_children",
    );
    // Measured today: one position (`Parent A position`, SW4) and one child row carrying
    // `needs_details = 'private care needs'`.
    expect(positions).toEqual([]);
    expect(children).toEqual([]);
  });

  it("`is_active_nanny()` carries the level term its own migration header claims for it", async () => {
    const rows = await asRole<{ active: boolean }>(
      db,
      APPLIED,
      "select public.is_active_nanny() as active",
    );
    expect(rows[0]).toEqual({ active: false });
  });
});
