// `int.dbs-consent-marker` — **the seam between a mock and a column, on the one road to L3.** REVIEW-4 C-1.
//
// REVIEW-3's M-5 said the Update Service consent instant must be the server's and not the client's, and `2c`
// answered it in two halves that never met:
//
//   · `0023:980-982` takes the **presence** of the key in the raw `p_columns` as the consent and stamps `now()`;
//   · `src/boot/db-vetting-store.ts:133-135` marks that presence with the value `true`.
//
// But `submit_verification_evidence` builds its update row with
// `jsonb_populate_record(v_row, verification_submission_columns(p_section, p_columns))` (`0023:926`), and
// `verification_submission_columns` filters **keys** while passing **values** through verbatim (`0022:85-88`
// keeps `dbs_update_service_consent_at` in the `dbs` allow-list). `verifications.dbs_update_service_consent_at`
// is `timestamptz`, so `jsonb_populate_record` casts `true` and raises
// `22007 invalid input syntax for type timestamp with time zone: "true"` — sixty lines before the stamp that
// was supposed to make the value irrelevant.
//
// `dbs-schema.ts:20` makes the tick mandatory (`z.literal("on")`) and `submit-dbs.ts:63` therefore always sets
// `updateServiceConsent: "true"`, so this is **every** DBS submission, not an edge. The nanny's certificate is
// deleted again by `submit-evidence.ts`'s `undo(uploaded)`, she reads "We couldn't save that just now", the
// `dbs` section never leaves `not_started`, and no nanny can reach L3 — which is to say the matching pool
// cannot be filled at all.
//
// Nothing caught it because nothing put the two halves in one room: `db-verification-stores.test.ts` pins the
// marker against a **fake port**, and `rpc-0022` / `rpc-0023` drive the definer with a **timestamptz string**.
// This file is the room. It asserts the constraint from both sides, so neither half can drift again:
//
//   1. a JSON boolean in that key is refused by the real definer — the defect, stated as a property;
//   2. a JSON null is accepted **and** the server still stamps the instant — the fix, stated as a property, so
//      "presence is the consent" survives.
//
// One transaction, rolled back, like `int.rls`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const NANNY_USER = "000000c1-0000-4000-8000-000000000000";

let db: Client;

/** The `dbs` columns `columnsOf` builds, with the consent marker left to the caller. */
const dbsColumns = (marker: unknown) => ({
  dbs_certificate_ref: `${NANNY_USER}/dbs/a.pdf`,
  dbs_certificate_number: "001234567890",
  dbs_issue_date: "2026-01-02",
  dbs_update_service_consent_at: marker,
});

/** `submit_verification_evidence` as the wizard calls it, under the nanny's own session. */
async function submitDbs(
  evidenceId: string,
  marker: unknown,
): Promise<{ readonly ok: boolean; readonly code: string }> {
  await db.query("savepoint dbs_probe");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: NANNY_USER, role: "authenticated" }),
    ]);
    await db.query("set local role authenticated");
    await db.query(
      `select public.submit_verification_evidence($1::uuid, 'dbs', 'dbs-certificate',
                                                  'stub-manual', 'needs_admin', $2::jsonb)`,
      [evidenceId, JSON.stringify(dbsColumns(marker))],
    );
    await db.query("reset role");
    await db.query("release savepoint dbs_probe");
    return { ok: true, code: "" };
  } catch (error) {
    await db.query("rollback to savepoint dbs_probe");
    await db.query("reset role");
    return { ok: false, code: (error as { code?: string }).code ?? "UNKNOWN" };
  }
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             'dbs-marker@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [NANNY_USER],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'nanny')`,
    [NANNY_USER],
  );
  await db.query(
    `insert into public.user_profiles (user_id, first_name, last_name, email, district, area)
     values ($1, 'Dee', 'Nanny', 'dbs-marker@example.test', 'SW4', 'Clapham')`,
    [NANNY_USER],
  );
  await db.query(
    `insert into public.nannies (user_id, is_isolated, verification_level)
     values ($1, false, 'L1_REGISTERED')`,
    [NANNY_USER],
  );
  await db.query(
    `insert into public.verifications (nanny_id)
     select id from public.nannies where user_id = $1`,
    [NANNY_USER],
  );
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.dbs — the Update Service consent marker is a value the column can hold (REVIEW-4 C-1)", () => {
  it("a JSON boolean in `dbs_update_service_consent_at` is refused by the definer — the column is timestamptz", async () => {
    const refused = await submitDbs(
      "000000e1-0000-4000-8000-000000000000",
      true,
    );

    expect(refused.ok).toBe(false);
    // 22007 invalid_datetime_format — raised by jsonb_populate_record while building the update row
    expect(refused.code).toBe("22007");
  });

  it("★ the marker the adapter sends is accepted, and the server still stamps the instant (REVIEW-3 M-5 intact)", async () => {
    const accepted = await submitDbs(
      "000000e2-0000-4000-8000-000000000000",
      null,
    );

    expect(accepted).toEqual({ ok: true, code: "" });

    const { rows } = await db.query<{ stamped: boolean; status: string }>(
      `select v.dbs_update_service_consent_at is not null as stamped, v.dbs_status::text as status
         from public.verifications v
         join public.nannies n on n.id = v.nanny_id
        where n.user_id = $1`,
      [NANNY_USER],
    );
    // presence is the consent (`0023:980-982`), the instant is the server's, and the section has moved
    expect(rows[0]).toEqual({ stamped: true, status: "pending" });
  });

  it("an omitted key leaves the instant alone — absent is not consent", async () => {
    await db.query(
      `update public.verifications v set dbs_update_service_consent_at = null, dbs_status = 'not_started'
         from public.nannies n where n.id = v.nanny_id and n.user_id = $1`,
      [NANNY_USER],
    );
    await db.query("savepoint dbs_absent");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: NANNY_USER, role: "authenticated" }),
    ]);
    await db.query("set local role authenticated");
    await db.query(
      `select public.submit_verification_evidence('000000e3-0000-4000-8000-000000000000'::uuid,
              'dbs', 'dbs-certificate', 'stub-manual', 'needs_admin',
              '{"dbs_certificate_number":"001234567890"}'::jsonb)`,
    );
    await db.query("reset role");

    const { rows } = await db.query<{ stamped: boolean }>(
      `select v.dbs_update_service_consent_at is not null as stamped
         from public.verifications v
         join public.nannies n on n.id = v.nanny_id
        where n.user_id = $1`,
      [NANNY_USER],
    );
    expect(rows[0].stamped).toBe(false);
    await db.query("release savepoint dbs_absent");
  });
});
