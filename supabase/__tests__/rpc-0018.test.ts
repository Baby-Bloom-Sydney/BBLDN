// `int.rpc-0018` — the functional suite over `upsert_call_mirror()`, the one write the C rows make.
//
// Written because of what S5b learned on `0017`: 151 metadata assertions passed over a function that
// could not insert a row, and only invoking it found the bug. Metadata proves the object exists;
// only a call proves it works. Everything here runs inside one transaction that is rolled back.
import type { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { connect } from "./db-client";
import { asRole, refusedAs, seedFixtures, type Fixtures } from "./rls-fixtures";

let db: Client;
let fx: Fixtures;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("begin");
  fx = await seedFixtures(db);
});
afterEach(async () => {
  await db.query("rollback");
});

type MirrorRow = {
  readonly outcome: string | null;
  readonly notes: string | null;
  readonly no_answer_count: number;
  readonly about_nanny: string | null;
  readonly version: number;
};

type PositionCallRow = {
  readonly call_state: string;
  readonly call_type: string | null;
  readonly call_booking_id: string | null;
};

const mirrorOf = async (positionId: string): Promise<MirrorRow | undefined> => {
  const { rows } = await db.query<MirrorRow>(
    `select outcome, notes, no_answer_count, about_nanny, version
       from public.position_call_mirror where position_id = $1`,
    [positionId],
  );
  return rows[0];
};

const positionCallOf = async (positionId: string): Promise<PositionCallRow> => {
  const { rows } = await db.query<PositionCallRow>(
    `select call_state, call_type, call_booking_id
       from public.nanny_positions where id = $1`,
    [positionId],
  );
  return rows[0];
};

/** C-a: the call is requested; state on the position, detail in the mirror, one transaction. */
const requestCall = (positionId: string, aboutNanny?: string) =>
  db.query(
    `select public.upsert_call_mirror(
       p_position_id       => $1,
       p_call_state        => 'awaiting-slot',
       p_no_answer_count   => 0,
       p_version           => 1,
       p_call_type         => 'matchmaking',
       p_call_requested_at => now(),
       p_about_nanny       => $2)`,
    [positionId, aboutNanny ?? null],
  );

describe("int.rpc-0018 — upsert_call_mirror writes both tables or neither", () => {
  it("C-a creates the detail row and moves the call state on the position", async () => {
    await requestCall(fx.positionA, "Amara");

    expect(await positionCallOf(fx.positionA)).toEqual({
      call_state: "awaiting-slot",
      call_type: "matchmaking",
      call_booking_id: null,
    });
    expect(await mirrorOf(fx.positionA)).toMatchObject({
      outcome: null,
      notes: null,
      no_answer_count: 0,
      about_nanny: "Amara",
      version: 1,
    });
  });

  it("a second call on the same position updates the one row, never inserts a second", async () => {
    await requestCall(fx.positionA);
    await db.query(
      `select public.upsert_call_mirror(
         p_position_id     => $1,
         p_call_state      => 'awaiting-slot',
         p_no_answer_count => 0,
         p_version         => 2,
         p_call_type       => 'matchmaking',
         p_about_nanny     => 'Priya')`,
      [fx.positionA],
    );
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.position_call_mirror where position_id = $1`,
      [fx.positionA],
    );
    expect(rows[0]?.n).toBe("1");
    expect((await mirrorOf(fx.positionA))?.about_nanny).toBe("Priya");
  });

  it("the version always moves forward, even when the caller hands back a stale one", async () => {
    await requestCall(fx.positionA);
    const { rows: second } = await db.query<{ upsert_call_mirror: number }>(
      `select public.upsert_call_mirror(
         p_position_id => $1, p_call_state => 'awaiting-slot',
         p_no_answer_count => 0, p_version => 1, p_call_type => 'matchmaking')`,
      [fx.positionA],
    );
    // the caller read version 1 and asked for 1 again; the row must not stand still
    expect(second[0]?.upsert_call_mirror).toBe(2);
    expect((await mirrorOf(fx.positionA))?.version).toBe(2);
  });

  // R5 / C-5. The count is a tally of events that already happened, so a decrement is always a bug —
  // and the caller computes the next value from a read that can go stale (database-reviewer M-4).
  it("refuses to wind the no-answer tally backwards", async () => {
    await requestCall(fx.positionA);
    await db.query(
      `select public.upsert_call_mirror(
         p_position_id => $1, p_call_state => 'awaiting-slot',
         p_no_answer_count => 2, p_version => 2, p_call_type => 'matchmaking')`,
      [fx.positionA],
    );
    await db.query("savepoint s");
    await expect(
      db.query(
        `select public.upsert_call_mirror(
           p_position_id => $1, p_call_state => 'awaiting-slot',
           p_no_answer_count => 1, p_version => 3, p_call_type => 'matchmaking')`,
        [fx.positionA],
      ),
    ).rejects.toThrow(/no_answer_count may not fall/);
    await db.query("rollback to savepoint s");
    expect((await mirrorOf(fx.positionA))?.no_answer_count).toBe(2);
  });

  // The 0006 D-3 biconditional: `slot-chosen` without a booking pointer is not a state the model has.
  it("cannot leave the call chosen with no booking behind it (0006's D-3 CHECK)", async () => {
    await requestCall(fx.positionA);
    await db.query("savepoint s");
    await expect(
      db.query(
        `select public.upsert_call_mirror(
           p_position_id => $1, p_call_state => 'slot-chosen',
           p_no_answer_count => 0, p_version => 2, p_call_type => 'matchmaking')`,
        [fx.positionA],
      ),
    ).rejects.toThrow(/call_state_requires_booking/);
    await db.query("rollback to savepoint s");
    expect((await positionCallOf(fx.positionA)).call_state).toBe(
      "awaiting-slot",
    );
  });

  // The whole reason this is one function: two `update`s through 03 §1.4's `Query` would be two
  // transactions, and a note with no outcome is exactly the half-write that would leave behind.
  it("a rejected detail write takes the position's call state with it", async () => {
    await requestCall(fx.positionA);
    await db.query("savepoint s");
    await expect(
      db.query(
        `select public.upsert_call_mirror(
           p_position_id => $1, p_call_state => 'awaiting-slot',
           p_no_answer_count => 0, p_version => 2, p_call_type => 'onboarding',
           p_notes => 'rang twice, no reply')`,
        [fx.positionA],
      ),
    ).rejects.toThrow(/notes_need_outcome/);
    await db.query("rollback to savepoint s");
    // the call_type must NOT have moved to onboarding: the two writes are one transaction
    expect((await positionCallOf(fx.positionA)).call_type).toBe("matchmaking");
  });

  it("refuses a position that does not exist rather than inventing one", async () => {
    await db.query("savepoint s");
    await expect(
      db.query(
        `select public.upsert_call_mirror(
           p_position_id => '00000000-0000-4000-8000-0000000000ff',
           p_call_state => 'awaiting-slot', p_no_answer_count => 0, p_version => 1)`,
      ),
    ).rejects.toThrow(/no position/);
    await db.query("rollback to savepoint s");
  });

  it("C-3 records the outcome and its note together", async () => {
    await requestCall(fx.positionA);
    await db.query(
      `select public.upsert_call_mirror(
         p_position_id => $1, p_call_state => 'awaiting-slot',
         p_no_answer_count => 0, p_version => 2, p_call_type => 'matchmaking',
         p_outcome => 'proceeding', p_notes => 'happy to go ahead')`,
      [fx.positionA],
    );
    expect(await mirrorOf(fx.positionA)).toMatchObject({
      outcome: "proceeding",
      notes: "happy to go ahead",
    });
  });
});

describe("int.rpc-0018 — who may read and who may write", () => {
  it("a parent reads her own call's detail and nobody else's", async () => {
    await requestCall(fx.positionA, "Amara");
    const mine = await asRole<{ about_nanny: string }>(
      db,
      fx.parentA,
      `select about_nanny from public.position_call_mirror`,
    );
    expect(mine.map((r) => r.about_nanny)).toEqual(["Amara"]);

    const theirs = await asRole(
      db,
      fx.parentB,
      `select about_nanny from public.position_call_mirror`,
    );
    expect(theirs).toEqual([]);
  });

  it("an admin reads every call's detail", async () => {
    await requestCall(fx.positionA);
    const rows = await asRole(
      db,
      fx.admin,
      `select position_id from public.position_call_mirror`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a signed-out visitor reads nothing", async () => {
    await requestCall(fx.positionA);
    // `0016` created this table after `0016:276`, so `anon` held SELECT on it by default privilege and
    // read nothing only because no policy names `anon`. `0036` took the grant: there is no `anon` read
    // policy here, so the grant was surplus, and "reads nothing" is now a refusal rather than an empty
    // result — the same claim, evidenced one layer earlier.
    const code = await refusedAs(
      db,
      null,
      `select position_id from public.position_call_mirror`,
    );
    expect(code).toBe("42501");
  });

  // 07 §5.1 rule 4: the module is the one writer. No client policy covers a write, so the write is
  // refused whatever the row says — this is the assertion that a client INSERT policy has not crept in.
  it("a parent cannot write her own call's detail", async () => {
    await requestCall(fx.positionA, "Amara");

    // This comment used to end "a client write that *appeared* to succeed while changing nothing is the
    // worse failure of the two" — and that was right, which is why `0036` removed the surplus UPDATE
    // grant that made the quiet version possible. With no UPDATE policy on this table the grant could
    // never carry a write, so the refusal moves from RLS (zero rows, no error) to the privilege check
    // (`42501`). Both halves of the claim are still asserted: the statement is refused, *and* the row
    // is untouched, because a refusal that left the row changed would be the thing worth catching.
    const changed = await refusedAs(
      db,
      fx.parentA,
      `update public.position_call_mirror set about_nanny = 'someone else' returning position_id`,
    );
    expect(changed).toBe("42501");
    expect((await mirrorOf(fx.positionA))?.about_nanny).toBe("Amara");

    // An INSERT had no `WITH CHECK` to pass either, and raised on RLS. After `0036` it does not reach
    // RLS at all — there is no INSERT grant left to spend — so it raises on the privilege instead. Both
    // are `42501`; the code is asserted rather than the message, because the message is the layer that
    // moved and the code is the claim.
    const inserted = await refusedAs(
      db,
      fx.parentA,
      `insert into public.position_call_mirror (position_id) values ($1)`,
      ["00000000-0000-4000-8000-0000000000ff"],
    );
    expect(inserted).toBe("42501");
  });

  it("neither anon nor authenticated may execute the definer", async () => {
    for (const who of [null, fx.parentA, fx.admin]) {
      await db.query("savepoint s");
      await expect(
        asRole(
          db,
          who,
          `select public.upsert_call_mirror(
             p_position_id => $1, p_call_state => 'awaiting-slot',
             p_no_answer_count => 0, p_version => 1)`,
          [fx.positionA],
        ),
      ).rejects.toThrow(/permission denied/);
      await db.query("rollback to savepoint s");
    }
  });
});

describe("int.rpc-0018 — availability_blocks.revoked_at", () => {
  it("a revoked block leaves the in-force set without being deleted (03 §3.2 unblock)", async () => {
    const { rows: cal } = await db.query<{ id: string }>(
      `select id from public.calendars limit 1`,
    );
    const calendarId = cal[0]?.id;
    expect(calendarId).toBeDefined();

    const { rows: block } = await db.query<{ id: string }>(
      `insert into public.availability_blocks (calendar_id, kind, start_at, end_at, reason)
       values ($1, 'blocked', now(), now() + interval '2 hours', 'admin away') returning id`,
      [calendarId],
    );

    const inForce = async () => {
      const { rows } = await db.query<{ n: string }>(
        `select count(*)::text as n from public.availability_blocks
          where calendar_id = $1 and revoked_at is null`,
        [calendarId],
      );
      return rows[0]?.n;
    };

    expect(await inForce()).toBe("1");
    await db.query(
      `update public.availability_blocks set revoked_at = now() where id = $1`,
      [block[0].id],
    );
    expect(await inForce()).toBe("0");
    // I-4 block-flags-never-cancels: the row survives, so the bookings it flagged stay auditable.
    const { rows: still } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.availability_blocks where id = $1`,
      [block[0].id],
    );
    expect(still[0]?.n).toBe("1");
  });
});
