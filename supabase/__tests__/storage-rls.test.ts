// `int.storage-rls` — the `verification-documents` bucket policies of `0015` exercised per role (07 §5.3 rule 2;
// 07 §4.14): a nanny may write under her own prefix and one of the four section names, and **nobody** may read an
// object through the table — not another nanny, not the owner herself. The read is a signed URL minted
// server-side, and that is the whole mechanism. Written by L-008 `2b`, whose wizard is the first writer of the
// bucket; the policy has existed since `0015`, so this suite proves rather than adds.
//
// One transaction, rolled back, like `int.rls`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { asRole, refusedAs, seedFixtures, type Fixtures } from "./rls-fixtures";

let db: Client;
let f: Fixtures;

const BUCKET = "verification-documents";

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  f = await seedFixtures(db);
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

const ownPath = (userId: string, section = "identity-document") =>
  `${userId}/${section}/11111111-1111-4111-8111-111111111111.jpg`;

describe("int.storage-rls — verification-documents (07 §5.3 rule 2)", () => {
  it("a nanny inserts under her own prefix and a section name; a foreign prefix or an unknown section is refused", async () => {
    // No `RETURNING`: PostgreSQL also runs a returned row through the SELECT policies, and this bucket has none for
    // a user by design (07 §5.3 rule 2) — measured: the same insert with `returning` is 42501. The storage API's
    // own upload does not return the row, so an authenticated own-prefix upload succeeds end to end (probed
    // against the local stack by 2b) while the nanny still cannot read the object back.
    await asRole(
      db,
      f.nannyVisible,
      `insert into storage.objects (bucket_id, name) values ($1, $2)`,
      [BUCKET, ownPath(f.nannyVisible)],
    );
    const { rows: written } = await db.query(
      `select name from storage.objects where bucket_id = $1 and name = $2`,
      [BUCKET, ownPath(f.nannyVisible)],
    );
    expect(written).toHaveLength(1);
    expect(
      await refusedAs(
        db,
        f.nannyVisible,
        `insert into storage.objects (bucket_id, name) values ($1, $2)`,
        [BUCKET, ownPath(f.nannyIsolated)],
      ),
    ).toBe("42501");
    expect(
      await refusedAs(
        db,
        f.nannyVisible,
        `insert into storage.objects (bucket_id, name) values ($1, $2)`,
        [BUCKET, ownPath(f.nannyVisible, "passport-scan")],
      ),
    ).toBe("42501");
  });

  it("another nanny cannot read the object — and neither can its owner; the read is a signed URL only", async () => {
    const byOther = await asRole(
      db,
      f.nannyIsolated,
      `select name from storage.objects where bucket_id = $1 and name like $2`,
      [BUCKET, `${f.nannyVisible}/%`],
    );
    expect(byOther).toEqual([]);
    const byOwner = await asRole(
      db,
      f.nannyVisible,
      `select name from storage.objects where bucket_id = $1`,
      [BUCKET],
    );
    expect(byOwner).toEqual([]);
    const byParent = await asRole(
      db,
      f.parentA,
      `select name from storage.objects where bucket_id = $1`,
      [BUCKET],
    );
    expect(byParent).toEqual([]);
  });

  it("no user may update or delete an evidence object — retention and the failed-scan undo are service-role", async () => {
    const updated = await asRole(
      db,
      f.nannyVisible,
      `update storage.objects set metadata = '{"x":1}'::jsonb where bucket_id = $1 and name = $2 returning name`,
      [BUCKET, ownPath(f.nannyVisible)],
    );
    expect(updated).toEqual([]);
    // A direct DELETE is refused before RLS is consulted: the stack's own `protect_objects_delete` trigger raises
    // for every role ("Use the Storage API instead") — measured. Deletion therefore goes through the Storage API
    // under the service role (`auth.data.removeObject`, ADR-155), which is the road 07 §5.3 rule 2 names.
    expect(
      await refusedAs(
        db,
        f.nannyVisible,
        `delete from storage.objects where bucket_id = $1 and name = $2`,
        [BUCKET, ownPath(f.nannyVisible)],
      ),
    ).not.toBe("NO_ERROR");
    const { rows } = await db.query(
      `select name from storage.objects where bucket_id = $1 and name = $2`,
      [BUCKET, ownPath(f.nannyVisible)],
    );
    expect(rows).toHaveLength(1);
  });

  it("an admin reads every object (the queue's signed-URL minter runs server-side anyway)", async () => {
    const byAdmin = await asRole(
      db,
      f.admin,
      `select name from storage.objects where bucket_id = $1`,
      [BUCKET],
    );
    expect(byAdmin.map((r) => r.name)).toContain(ownPath(f.nannyVisible));
  });
});
