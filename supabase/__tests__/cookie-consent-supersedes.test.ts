// `int.cookie-consent-supersedes` — the database half of L-009 `3e`'s ruling (b), against the applied schema.
//
// `3c` measured the legacy route's defect and recommended the fix; this is the measurement kept as a test, so
// that "she can change her mind" is proven where the constraint actually lives rather than only against a
// memory store.
//
//   * A **raw insert** — what the route did — collides on `cookie_consent_records_current_idx` (`0004`), which
//     is UNIQUE on `(visitor_id) where superseded_by is null`. The second choice raised `23505` and the route
//     answered 500.
//   * **`record_cookie_consent`** (`0017`) — what the route does now — writes a new row and stamps
//     `superseded_by` on the one it replaces, in one transaction behind a per-visitor advisory lock. The old
//     row is never edited away, the new row is the latest, and there is exactly one current answer.
//
// The first case is the one worth keeping for ever: it is the reason the connector exists, and a future
// "simplify" that points the route back at the table would make it fail.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const VISITOR_RAW = "int-3e-raw-visitor";
const VISITOR_RPC = "int-3e-rpc-visitor";

let db: Client;

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.cookie-consent — a raw insert cannot record a change of mind", () => {
  it("★ the second choice collides on the current-row unique index (the measured defect)", async () => {
    await db.query(
      `insert into public.cookie_consent_records
         (visitor_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
       values ($1, 'accept_all', true, true, now() + interval '365 days')`,
      [VISITOR_RAW],
    );

    await db.query("savepoint second_choice");
    let code = "";
    try {
      await db.query(
        `insert into public.cookie_consent_records
           (visitor_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
         values ($1, 'reject_non_essential', false, false, now() + interval '365 days')`,
        [VISITOR_RAW],
      );
    } catch (error) {
      code = (error as { code?: string }).code ?? "";
    }
    await db.query("rollback to savepoint second_choice");

    expect(code).toBe("23505");
  });
});

describe("int.cookie-consent — the connector's path records one (ADR-175 (b))", () => {
  it("★ two choices leave two rows, the first superseded by the second", async () => {
    const FIRST = "000000c7-0000-4000-8000-000000000001";
    const SECOND = "000000c7-0000-4000-8000-000000000002";

    const opening = await db.query<{ superseded: string | null }>(
      `select public.record_cookie_consent(
         $2::uuid, $1, 'accept_all', true, true, now() + interval '365 days', now()) as superseded`,
      [VISITOR_RPC, FIRST],
    );
    const changed = await db.query<{ superseded: string | null }>(
      `select public.record_cookie_consent(
         $2::uuid, $1, 'reject_non_essential', false, false, now() + interval '365 days', now()) as superseded`,
      [VISITOR_RPC, SECOND],
    );

    // The RPC answers with the row it superseded, which is `null` for a visitor's first ever choice — so the
    // caller can tell "she has changed her mind" from "she has just answered" without a second read.
    expect(opening.rows[0].superseded).toBeNull();
    expect(changed.rows[0].superseded).toBe(FIRST);

    const rows = await db.query<{
      id: string;
      consent_choice: string;
      superseded_by: string | null;
    }>(
      `select id, consent_choice, superseded_by from public.cookie_consent_records
        where visitor_id = $1 order by created_at`,
      [VISITOR_RPC],
    );

    expect(rows.rows).toHaveLength(2);
    // The earlier choice is still there, unedited except for the stamp — this is what "append-only" means.
    expect(rows.rows[0].id).toBe(FIRST);
    expect(rows.rows[0].consent_choice).toBe("accept_all");
    expect(rows.rows[0].superseded_by).toBe(SECOND);
    expect(rows.rows[1].consent_choice).toBe("reject_non_essential");
    expect(rows.rows[1].superseded_by).toBeNull();
  });

  it("and exactly one row is current, which is what the read takes", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.cookie_consent_records
        where visitor_id = $1 and superseded_by is null`,
      [VISITOR_RPC],
    );
    expect(rows[0].n).toBe("1");
  });
});
