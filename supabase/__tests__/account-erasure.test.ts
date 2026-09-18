// `int.account-erasure` — B-46: the right to erasure, proven by running it (`3f`, L-009).
//
// 07 §6.1 has specified this path since Phase 0 and nothing executed it. `0027` made the schema safe for the
// safeguarding half; this suite is the other question — **does an Art 17 request actually work, class by class?**
// It seeds one parent and one nanny carrying data in every class 07 §3 lists, runs the job, and asserts per class
// that the right thing happened: gone, pseudonymised-and-present, or refused. Nothing here reads a catalogue.
//
// The four claims the merge rests on, each driven:
//
//   1. **Per class.** Class A/B/H/I/J/K/M content is gone or anonymised; class F (consent), G (money) and the
//      safeguarding rows of §6.2 row 4 are **still there**, with the erased subject pseudonymous.
//   2. **The other party's history survives.** A parent erasing her account must not delete the nanny's record of
//      the placement she worked — the defect the six `on delete set null` keys of `0028` exist to end.
//   3. **Idempotent.** A second request for an already-erased subject succeeds and changes nothing (07 §6.1's own
//      word). A data-subject request is not a thing you may fail for being repeated.
//   4. **It refuses rather than half-runs.** A live placement or subscription is a *recorded* refusal, committed
//      onto the request row with its reason. A forgotten pseudonym is a *raised* one — `0027`'s CHECK — and takes
//      the whole transaction with it, so nothing is half-erased.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const P_USER = "000000f0-0000-4000-8000-000000000001";
const N_USER = "000000f0-0000-4000-8000-000000000002";
const ADMIN = "000000f0-0000-4000-8000-000000000003";
const PARENT = "000000f0-0000-4000-8000-000000000011";
const NANNY = "000000f0-0000-4000-8000-000000000012";
const POSITION = "000000f0-0000-4000-8000-000000000021";
const CONNECTION = "000000f0-0000-4000-8000-000000000022";
const PLACEMENT = "000000f0-0000-4000-8000-000000000023";
const CHILD = "000000f0-0000-4000-8000-000000000031";
const BOT = "000000f0-0000-4000-8000-000000000032";
const VERIFICATION = "000000f0-0000-4000-8000-000000000041";
const SUBMISSION = "000000f0-0000-4000-8000-000000000042";
const LIFT = "000000f0-0000-4000-8000-000000000043";
const CALENDAR = "000000f0-0000-4000-8000-000000000051";
const BOOKING = "000000f0-0000-4000-8000-000000000052";
const P_REQUEST = "000000f0-0000-4000-8000-000000000061";
const N_REQUEST = "000000f0-0000-4000-8000-000000000062";

let db: Client;

type Erasure = {
  readonly outcome: string;
  readonly reason?: string;
  readonly retainedClasses: readonly string[];
  readonly scrubbedTables: readonly string[];
  readonly objectCount: number;
};

async function erase(
  subject: string,
  requestId: string,
  objects: unknown = [],
): Promise<Erasure> {
  const { rows } = await db.query<{ erase_account: Erasure }>(
    "select public.erase_account($1::uuid, $2::uuid, $3::jsonb) as erase_account",
    [subject, requestId, JSON.stringify(objects)],
  );
  return rows[0].erase_account;
}

async function one<T extends Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const { rows } = await db.query<T>(sql, [...params]);
  return rows[0] ?? null;
}

async function count(sql: string, params: readonly unknown[] = []) {
  const row = await one<{ n: string }>(sql, params);
  return Number(row?.n ?? "0");
}

async function insertUser(id: string, email: string) {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
}

/**
 * One parent and one nanny who have actually used the product: a position with children and a schedule, a
 * connection, an ENDED placement with notes on both sides, a pre-check row, a child with Katie chat, an inbox
 * message, a booking with a call note, a consent record, a cancelled subscription with a payment event, an email
 * log — and on the nanny's side a full safeguarding trail (a decided DBS submission and a lifted bar).
 */
async function seed(): Promise<void> {
  await insertUser(P_USER, "erasure-parent@example.test");
  await insertUser(N_USER, "erasure-nanny@example.test");
  await insertUser(ADMIN, "erasure-admin@example.test");
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1,'parent'), ($2,'nanny'), ($3,'admin')`,
    [P_USER, N_USER, ADMIN],
  );
  await db.query(
    `insert into public.user_profiles (user_id, first_name, last_name, email, mobile, date_of_birth, profile_picture_path)
     values ($1::uuid,'Priya','Parent',$2,'+447700900001','1988-01-01','parent/' || $1 || '/a.jpg'),
            ($3::uuid,'Nadia','Nanny',$4,'+447700900002','1992-02-02','nanny/' || $3 || '/b.jpg'),
            ($5::uuid,'Ada','Admin',$6,null,null,null)`,
    [
      P_USER,
      "erasure-parent@example.test",
      N_USER,
      "erasure-nanny@example.test",
      ADMIN,
      "erasure-admin@example.test",
    ],
  );
  await db.query(
    `insert into public.parents (id, user_id, signup_source) values ($1,$2,'results')`,
    [PARENT, P_USER],
  );
  await db.query(`insert into public.nannies (id, user_id) values ($1,$2)`, [
    NANNY,
    N_USER,
  ]);

  // Class B — the funnel the two of them went through together.
  await db.query(
    `insert into public.nanny_positions (id, parent_id, source, stage, ended_at, end_reason,
                                         title, description, other_requirements)
     values ($1,$2,'results_signup','ENDED', now() - interval '20 days', 'natural',
             'Nanny for Priya''s twins','Two children, Tuesdays','No pets please')`,
    [POSITION, PARENT],
  );
  await db.query(
    `insert into public.position_children (position_id, child_label, age_months)
     values ($1,'A',18)`,
    [POSITION],
  );
  await db.query(
    `insert into public.position_schedule (position_id, schedule) values ($1,'{"mon":true}'::jsonb)`,
    [POSITION],
  );
  await db.query(
    `insert into public.connection_requests (id, position_id, parent_id, nanny_id, stage, origin, message)
     values ($1,$2,$3,$4,'FINISHED','parent_request','Hello, we would love to meet you')`,
    [CONNECTION, POSITION, PARENT, NANNY],
  );
  await db.query(
    `insert into public.nanny_placements (id, position_id, connection_id, parent_id, nanny_id, source, state,
                                          ended_at, end_reason, nanny_notes, parent_notes)
     values ($1,$2,$3,$4,$5,'connection','ENDED', now() - interval '30 days', 'natural',
             'Lovely family','She was wonderful with the twins')`,
    [PLACEMENT, POSITION, CONNECTION, PARENT, NANNY],
  );
  await db.query(
    `insert into public.precheck_notifications (position_id, nanny_id) values ($1,$2)`,
    [POSITION, NANNY],
  );

  // Classes H / I / J — the child, and Katie.
  await db.query(
    `insert into public.children (id, parent_user_id, first_name, date_of_birth)
     values ($1,$2,'Twin A','2024-01-01')`,
    [CHILD, P_USER],
  );
  await db.query(
    `insert into public.bloombot (id, user_id, role) values ($1,$2,'parent')`,
    [BOT, P_USER],
  );
  await db.query(
    `insert into public.chat_messages (bloombot_id, child_id, role, content)
     values ($1,$2,'user','She said her first word today')`,
    [BOT, CHILD],
  );

  // Class K — comms.
  await db.query(
    `insert into public.inbox_messages (user_id, type, title, actor)
     values ($1,'connection','Your nanny accepted','system')`,
    [P_USER],
  );
  await db.query(
    `insert into public.email_logs (template_id, recipient_user_id, recipient_email, status, sent_at)
     values ('welcome-parent',$1,$2,'sent', now())`,
    [P_USER, "erasure-parent@example.test"],
  );

  // A booking with a free-text call note (07 §6.1 step 4).
  await db.query(
    `insert into public.calendars (id, name, timezone, slot_minutes, booking_horizon_days, lead_time_minutes, hold_minutes)
     values ($1,'Commission calls','Europe/London',30,30,60,15)`,
    [CALENDAR],
  );
  await db.query(
    `insert into public.bookings (id, calendar_id, kind, booked_by_role, booked_by_user_id, subject_type,
                                  subject_id, start_at, end_at, status, priority, call_note)
     values ($1,$2,'matchmaking','parent',$3,'position',$4,
             now() + interval '1 day', now() + interval '1 day 30 minutes','booked',2,
             'Priya mentioned her older child has additional needs')`,
    [BOOKING, CALENDAR, P_USER, POSITION],
  );

  // Class F — consent. This is one of the three that MUST survive.
  const doc = await one<{
    document_id: string;
    version: number;
    content_hash: string;
  }>(
    `select document_id, version, content_hash from public.legal_documents
      where document_id = 'client-tos' order by version desc limit 1`,
  );
  if (doc !== null)
    await db.query(
      `insert into public.consent_records (user_id, party, agreement_id, checkpoint_id, checkpoint_text,
                                           consent_given, purpose, document_id, document_version, document_content_hash)
       values ($1,'parent','agr-erasure-1','cp-1','I agree to the terms', true, 'client-tos', $2, $3, $4)`,
      [P_USER, doc.document_id, doc.version, doc.content_hash],
    );

  // Class G — money. The second that must survive.
  await db.query(
    `insert into public.parent_subscriptions (parent_user_id, status, plan_shape, purchase_path)
     values ($1,'cancelled','upfront','self_serve')`,
    [P_USER],
  );
  await db.query(
    `insert into public.payment_events (provider, provider_event_id, event_type, payload, parent_user_id)
     values ('stub-stripe','evt_erasure_1','checkout.session.completed','{}'::jsonb,$1)`,
    [P_USER],
  );

  // The safeguarding trail — the third that must survive, pseudonymised (ADR-170).
  await db.query(
    `insert into public.verifications (id, nanny_id, level, identity_status, dbs_status, dbs_outcome,
                                       suspended_at, dbs_checked_by, identity_checked_by, rtw_checked_by,
                                       surname, given_names, dbs_certificate_number, dbs_certificate_ref)
     values ($1,$2,'L0_SIGNED_UP','not_started','failed','barred', now(),'admin','admin','admin',
             'Nanny','Nadia','001234567890', $3::text || '/dbs-certificate/x.pdf')`,
    [VERIFICATION, NANNY, N_USER],
  );
  await db.query(
    `insert into public.vetting_submissions (id, verification_id, nanny_id, section, evidence_type, provider_key,
                                             status, evidence_id, decided_by, checked_at)
     values ($1,$2,$3,'dbs','dbs-certificate','stub-manual','needs_admin',gen_random_uuid(),$4, now())`,
    [SUBMISSION, VERIFICATION, NANNY, ADMIN],
  );
  await db.query(
    `insert into public.nanny_suspension_lifts (id, nanny_id, decided_by, reason, previous_dbs_outcome,
                                                suspended_since)
     values ($1,$2,$3,'Certificate was another person''s','barred', now() - interval '10 days')`,
    [LIFT, NANNY, ADMIN],
  );

  // Storage objects, so `collect_erasure_objects()` has something real to find.
  await db.query(
    `insert into storage.objects (bucket_id, name, owner_id) values
       ('profile-pictures', 'parent/' || $1::text || '/a.jpg', $1::uuid),
       ('profile-pictures', 'nanny/' || $2::text || '/b.jpg', $2::uuid),
       ('verification-documents', $2::text || '/dbs-certificate/x.pdf', $2::uuid),
       ('development-images', 'children/' || $3::text || '/first-steps.jpg', $1::uuid),
       ('development-images', 'chat/' || $1::text || '/note.jpg', $1::uuid)`,
    [P_USER, N_USER, CHILD],
  );

  await db.query(
    `insert into public.account_erasure_requests (id, subject_user_id, requested_by, road)
     values ($1::uuid,$2::uuid,$2::uuid,'self-service')`,
    [P_REQUEST, P_USER],
  );
  await db.query(
    `insert into public.account_erasure_requests (id, subject_user_id, requested_by, road)
     values ($1,$2,$3,'admin')`,
    [N_REQUEST, N_USER, ADMIN],
  );
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  await seed();
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("int.account-erasure — the objects, collected before anything is written", () => {
  it("finds every object of the subject, by the prefix 0015's policies use", async () => {
    const { rows } = await db.query<{
      bucket: string;
      path: string;
      entity_kind: string;
    }>(
      "select * from public.collect_erasure_objects($1::uuid) order by bucket, path",
      [P_USER],
    );
    expect(rows.map((r) => `${r.bucket}/${r.path}`)).toEqual([
      `development-images/chat/${P_USER}/note.jpg`,
      `development-images/children/${CHILD}/first-steps.jpg`,
      `profile-pictures/parent/${P_USER}/a.jpg`,
    ]);
    // The child's image is attributed to the child, not to the parent — `file_retention_log` keeps the entity it
    // belonged to, and that is not always the person who asked.
    expect(rows.find((r) => r.path.includes("children/"))?.entity_kind).toBe(
      "child",
    );
  });

  it("does not reach another person's objects", async () => {
    const { rows } = await db.query(
      "select * from public.collect_erasure_objects($1::uuid)",
      [N_USER],
    );
    expect(
      rows.every((r: Record<string, unknown>) =>
        String(r.path).includes(N_USER),
      ),
    ).toBe(true);
  });
});

describe("int.account-erasure — a parent asks to be erased (07 §6.1)", () => {
  let result: Erasure;

  beforeAll(async () => {
    result = await erase(P_USER, P_REQUEST, [
      {
        bucket: "profile-pictures",
        path: `parent/${P_USER}/a.jpg`,
        entityKind: "user",
        entityId: P_USER,
      },
      {
        bucket: "development-images",
        path: `children/${CHILD}/first-steps.jpg`,
        entityKind: "child",
        entityId: CHILD,
      },
    ]);
  });

  it("answers `erased`, and names what is retained and why is config's to say", () => {
    expect(result.outcome).toBe("erased");
    expect(result.retainedClasses).toEqual([
      "money",
      "consent",
      "safeguarding",
    ]);
    expect(result.objectCount).toBe(2);
  });

  // ── GONE ────────────────────────────────────────────────────────────────────────────────────────────────
  it("class A — the `parents` row is gone and the profile is a tombstone", async () => {
    expect(
      await count(
        "select count(*)::text n from public.parents where user_id = $1",
        [P_USER],
      ),
    ).toBe(0);
    const profile = await one<{
      first_name: string;
      email: string;
      mobile: string | null;
      date_of_birth: string | null;
      profile_picture_path: string | null;
    }>("select * from public.user_profiles where user_id = $1", [P_USER]);
    expect(profile?.first_name).toBe("Deleted");
    expect(profile?.email).toBe(`deleted+${P_USER}@invalid`);
    expect(profile?.mobile).toBeNull();
    expect(profile?.date_of_birth).toBeNull();
    expect(profile?.profile_picture_path).toBeNull();
  });

  it("class A — `auth.users` is tombstoned, password-less and banned for ever (step 5)", async () => {
    // `banned_until` is `infinity`, which `pg` hands back as the string 'infinity' rather than a Date — so the
    // assertion reads it as SQL sees it. A sign-in is impossible for ever; that is the whole property.
    const user = await one<{
      email: string;
      encrypted_password: string | null;
      banned: boolean;
      phone: string | null;
    }>(
      `select email, encrypted_password, phone,
              (banned_until = 'infinity'::timestamptz) as banned
         from auth.users where id = $1`,
      [P_USER],
    );
    expect(user?.email).toBe(`deleted+${P_USER}@invalid`);
    expect(user?.encrypted_password).toBeNull();
    expect(user?.phone).toBeNull();
    expect(user?.banned).toBe(true);
  });

  it("classes H / I / J — the child, its records and Katie's memory of it are gone", async () => {
    expect(
      await count(
        "select count(*)::text n from public.children where parent_user_id = $1",
        [P_USER],
      ),
    ).toBe(0);
    expect(
      await count(
        "select count(*)::text n from public.bloombot where user_id = $1",
        [P_USER],
      ),
    ).toBe(0);
    expect(
      await count(
        "select count(*)::text n from public.chat_messages where bloombot_id = $1",
        [BOT],
      ),
    ).toBe(0);
  });

  it("class K — the inbox is gone and the email log's recipient is a tombstone", async () => {
    expect(
      await count(
        "select count(*)::text n from public.inbox_messages where user_id = $1",
        [P_USER],
      ),
    ).toBe(0);
    const log = await one<{ recipient_email: string }>(
      "select recipient_email from public.email_logs where recipient_user_id = $1",
      [P_USER],
    );
    expect(log?.recipient_email).toBe(`deleted+${P_USER}@invalid`);
  });

  it("class B free text — the position's words, the message and the call note are gone", async () => {
    const position = await one<{
      title: string | null;
      description: string | null;
      other_requirements: string | null;
    }>("select * from public.nanny_positions where id = $1", [POSITION]);
    expect(position?.title).toBeNull();
    expect(position?.description).toBeNull();
    expect(position?.other_requirements).toBeNull();
    expect(
      await count(
        "select count(*)::text n from public.position_children where position_id = $1",
        [POSITION],
      ),
    ).toBe(0);
    const connection = await one<{ message: string | null }>(
      "select message from public.connection_requests where id = $1",
      [CONNECTION],
    );
    expect(connection?.message).toBeNull();
    const booking = await one<{ call_note: string | null }>(
      "select call_note from public.bookings where id = $1",
      [BOOKING],
    );
    expect(booking?.call_note).toBeNull();
  });

  // ── PRESENT, WITHOUT HER ────────────────────────────────────────────────────────────────────────────────
  it("★ class B — the NANNY's history survives, with the nanny's id and without the parent's", async () => {
    const placement = await one<{
      parent_id: string | null;
      nanny_id: string | null;
      parent_notes: string | null;
      state: string;
    }>("select * from public.nanny_placements where id = $1", [PLACEMENT]);
    // This row is the hire record §6.2 row 6 keeps for six years. Before `0028` a parent's erasure deleted it.
    expect(placement).not.toBeNull();
    expect(placement?.parent_id).toBeNull();
    expect(placement?.nanny_id).toBe(NANNY);
    expect(placement?.parent_notes).toBeNull();
    expect(placement?.state).toBe("ENDED");

    const connection = await one<{
      parent_id: string | null;
      nanny_id: string | null;
    }>("select * from public.connection_requests where id = $1", [CONNECTION]);
    expect(connection?.parent_id).toBeNull();
    expect(connection?.nanny_id).toBe(NANNY);

    const position = await one<{ parent_id: string | null }>(
      "select parent_id from public.nanny_positions where id = $1",
      [POSITION],
    );
    expect(position?.parent_id).toBeNull();
  });

  it("★ class G — money is untouched (§6.2 row 9: six years, HMRC and the Limitation Act)", async () => {
    expect(
      await count(
        "select count(*)::text n from public.parent_subscriptions where parent_user_id = $1",
        [P_USER],
      ),
    ).toBe(1);
    expect(
      await count(
        "select count(*)::text n from public.payment_events where parent_user_id = $1",
        [P_USER],
      ),
    ).toBe(1);
  });

  it("★ class F — the consent trail is untouched, with its `user_id` intact (§6.2 row 11)", async () => {
    const consent = await one<{ user_id: string; consent_given: boolean }>(
      "select user_id, consent_given from public.consent_records where user_id = $1",
      [P_USER],
    );
    expect(consent?.user_id).toBe(P_USER);
    expect(consent?.consent_given).toBe(true);
  });

  // ── THE EVIDENCE ────────────────────────────────────────────────────────────────────────────────────────
  it("writes one `file_retention_log` row per object, hashed, never the path (§6.2 row 16)", async () => {
    const { rows } = await db.query<{
      bucket: string;
      path_hash: string;
      entity_kind: string;
      entity_id: string;
      job: string;
    }>(
      "select * from public.file_retention_log where reason = 'account-erasure' order by bucket",
      [],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.entity_kind).sort()).toEqual(["child", "user"]);
    expect(rows.every((r) => r.job === "delete-account")).toBe(true);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.path_hash))).toBe(true);
    // The identifiers the deletion removed must not come back in the evidence of the deletion.
    expect(rows.some((r) => r.path_hash.includes(P_USER))).toBe(false);
  });

  it("closes the request row with what it did", async () => {
    const request = await one<{
      state: string;
      object_count: number;
      scrubbed_tables: string[];
      completed_at: Date | null;
    }>("select * from public.account_erasure_requests where id = $1", [
      P_REQUEST,
    ]);
    expect(request?.state).toBe("completed");
    expect(request?.object_count).toBe(2);
    expect(request?.completed_at).not.toBeNull();
    expect(request?.scrubbed_tables).toContain("parents");
    expect(request?.scrubbed_tables).toContain("auth.users");
  });

  // ── IDEMPOTENCE ─────────────────────────────────────────────────────────────────────────────────────────
  it("★ a second request for the same subject succeeds and changes nothing", async () => {
    const before = await one<{ n: string }>(
      "select count(*)::text n from public.file_retention_log",
    );
    const again = await erase(P_USER, P_REQUEST, [
      {
        bucket: "profile-pictures",
        path: `parent/${P_USER}/a.jpg`,
        entityKind: "user",
        entityId: P_USER,
      },
    ]);
    const after = await one<{ n: string }>(
      "select count(*)::text n from public.file_retention_log",
    );
    expect(again.outcome).toBe("already-erased");
    expect(again.objectCount).toBe(0);
    expect(after?.n).toBe(before?.n);
  });
});

describe("int.account-erasure — a nanny asks to be erased (ADR-170 is the whole point)", () => {
  let result: Erasure;

  beforeAll(async () => {
    result = await erase(N_USER, N_REQUEST);
  });

  it("★ the safeguarding decisions survive, pseudonymised, correlated to one another", async () => {
    const verification = await one<{
      nanny_id: string | null;
      subject_pseudonym: string | null;
      dbs_outcome: string;
      surname: string | null;
      dbs_certificate_number: string | null;
    }>("select * from public.verifications where id = $1", [VERIFICATION]);
    expect(verification?.dbs_outcome).toBe("barred");
    expect(verification?.nanny_id).toBeNull();
    expect(verification?.subject_pseudonym).toBe(NANNY);
    // The decision is kept; the identity inside it is not. That is the difference between "we keep a decision
    // about you" and "we keep your file", and it is the sentence `LEGAL.erasureRetains` promises her.
    expect(verification?.surname).toBeNull();
    expect(verification?.dbs_certificate_number).toBeNull();

    const submission = await one<{
      subject_pseudonym: string | null;
      decided_by: string;
    }>("select * from public.vetting_submissions where id = $1", [SUBMISSION]);
    const lift = await one<{
      subject_pseudonym: string | null;
      reason: string;
    }>("select * from public.nanny_suspension_lifts where id = $1", [LIFT]);
    expect(submission?.subject_pseudonym).toBe(NANNY);
    expect(lift?.subject_pseudonym).toBe(NANNY);
    expect(lift?.reason).toBe("Certificate was another person's");
    expect(result.outcome).toBe("erased");
  });

  it("the nanny's `nannies` row is gone and the pre-check row survives without her", async () => {
    expect(
      await count(
        "select count(*)::text n from public.nannies where user_id = $1",
        [N_USER],
      ),
    ).toBe(0);
    const precheck = await one<{ nanny_id: string | null }>(
      "select nanny_id from public.precheck_notifications where position_id = $1",
      [POSITION],
    );
    expect(precheck).not.toBeNull();
    expect(precheck?.nanny_id).toBeNull();
  });

  it("the placement is now a skeleton — both parties erased, the hire record still counted", async () => {
    const placement = await one<{
      parent_id: string | null;
      nanny_id: string | null;
      state: string;
    }>("select * from public.nanny_placements where id = $1", [PLACEMENT]);
    expect(placement).not.toBeNull();
    expect(placement?.parent_id).toBeNull();
    expect(placement?.nanny_id).toBeNull();
    expect(placement?.state).toBe("ENDED");
  });
});

// ── Refusals ──────────────────────────────────────────────────────────────────────────────────────────────
//
// Ruling (c): the job refuses rather than half-runs, and a refusal is reported as a refusal. Two kinds, and they
// behave differently on purpose. A *recorded* refusal is policy — the person must end the placement or cancel the
// subscription first — so it commits the reason onto her request row and touches nothing else. A *raised* refusal
// is an invariant or contention, and it takes the whole transaction with it so that nothing is half-erased.

const R_USER = "000000f0-0000-4000-8000-0000000000a1";
const R_PARENT = "000000f0-0000-4000-8000-0000000000a2";
const R_POSITION = "000000f0-0000-4000-8000-0000000000a3";
const R_PLACEMENT = "000000f0-0000-4000-8000-0000000000a4";
const R_REQUEST = "000000f0-0000-4000-8000-0000000000a5";
const S_USER = "000000f0-0000-4000-8000-0000000000b1";
const S_REQUEST = "000000f0-0000-4000-8000-0000000000b2";
const G_USER = "000000f0-0000-4000-8000-0000000000c1";
const G_NANNY = "000000f0-0000-4000-8000-0000000000c2";
const G_VERIFICATION = "000000f0-0000-4000-8000-0000000000c3";
const G_REQUEST = "000000f0-0000-4000-8000-0000000000c4";

describe("int.account-erasure — it refuses rather than half-runs (ruling (c))", () => {
  beforeAll(async () => {
    // A parent mid-placement: the one case 07 §6.1 step 1 names first.
    await insertUser(R_USER, "erasure-refused@example.test");
    await db.query(
      `insert into public.user_profiles (user_id, first_name, last_name, email) values ($1,'Rita','Refused',$2)`,
      [R_USER, "erasure-refused@example.test"],
    );
    await db.query(
      `insert into public.parents (id, user_id, signup_source) values ($1,$2,'results')`,
      [R_PARENT, R_USER],
    );
    await db.query(
      `insert into public.nanny_positions (id, parent_id, source, stage) values ($1,$2,'results_signup','ACTIVE')`,
      [R_POSITION, R_PARENT],
    );
    await db.query(
      `insert into public.nanny_placements (id, position_id, parent_id, source, state, weekly_hours, hourly_rate_pence)
       values ($1,$2,$3,'invite_shell','ACTIVE',20,1500)`,
      [R_PLACEMENT, R_POSITION, R_PARENT],
    );
    await db.query(
      `insert into public.account_erasure_requests (id, subject_user_id, road) values ($1::uuid,$2::uuid,'self-service')`,
      [R_REQUEST, R_USER],
    );

    // A parent whose subscription is still taking money.
    await insertUser(S_USER, "erasure-subscribed@example.test");
    await db.query(
      `insert into public.user_profiles (user_id, first_name, last_name, email) values ($1,'Sara','Subscribed',$2)`,
      [S_USER, "erasure-subscribed@example.test"],
    );
    await db.query(
      `insert into public.parent_subscriptions (parent_user_id, status, plan_shape, purchase_path)
       values ($1,'active','upfront','self_serve')`,
      [S_USER],
    );
    await db.query(
      `insert into public.account_erasure_requests (id, subject_user_id, road) values ($1::uuid,$2::uuid,'admin')`,
      [S_REQUEST, S_USER],
    );
  });

  it("★ a live placement is a RECORDED refusal — the reason is committed and nothing is erased", async () => {
    const result = await erase(R_USER, R_REQUEST);
    expect(result.outcome).toBe("refused");
    expect(result.reason).toBe("live-placement");

    const request = await one<{ state: string; refusal_reason: string }>(
      "select state, refusal_reason from public.account_erasure_requests where id = $1",
      [R_REQUEST],
    );
    expect(request?.state).toBe("refused");
    expect(request?.refusal_reason).toBe("live-placement");

    // Half a refusal would be the worst outcome of all: her name is still her name, her `parents` row is there.
    const profile = await one<{ first_name: string }>(
      "select first_name from public.user_profiles where user_id = $1",
      [R_USER],
    );
    expect(profile?.first_name).toBe("Rita");
    expect(
      await count("select count(*)::text n from public.parents where id = $1", [
        R_PARENT,
      ]),
    ).toBe(1);
  });

  it("★ an active subscription is a RECORDED refusal too (step 1's other arm)", async () => {
    const result = await erase(S_USER, S_REQUEST);
    expect(result.outcome).toBe("refused");
    expect(result.reason).toBe("live-subscription");
    expect(
      await count(
        "select count(*)::text n from public.parent_subscriptions where parent_user_id = $1",
        [S_USER],
      ),
    ).toBe(1);
  });

  it("★ a forgotten pseudonym is a RAISED refusal — `0027`'s CHECK, and nothing commits", async () => {
    // The guard `3e` built: drop the trigger that writes the pseudonym and the delete must refuse rather than
    // quietly detach a safeguarding decision from its subject. This unit's contribution is to prove the ERASURE
    // JOB inherits it — that the refusal reaches the caller as a refusal, and that the request row is not
    // quietly left saying the erasure completed.
    await insertUser(G_USER, "erasure-guarded@example.test");
    await db.query(
      `insert into public.user_profiles (user_id, first_name, last_name, email) values ($1,'Gina','Guarded',$2)`,
      [G_USER, "erasure-guarded@example.test"],
    );
    await db.query(`insert into public.nannies (id, user_id) values ($1,$2)`, [
      G_NANNY,
      G_USER,
    ]);
    await db.query(
      `insert into public.verifications (id, nanny_id, level, identity_status, dbs_status, dbs_outcome,
                                         suspended_at, dbs_checked_by, identity_checked_by, rtw_checked_by)
       values ($1,$2,'L0_SIGNED_UP','not_started','failed','barred', now(),'admin','admin','admin')`,
      [G_VERIFICATION, G_NANNY],
    );
    await db.query(
      `insert into public.account_erasure_requests (id, subject_user_id, road) values ($1::uuid,$2::uuid,'admin')`,
      [G_REQUEST, G_USER],
    );

    await db.query("savepoint guard_probe");
    await db.query(
      "drop trigger nannies_pseudonymise_safeguarding on public.nannies",
    );
    let message = "the erasure was ACCEPTED with the pseudonymiser gone";
    try {
      await erase(G_USER, G_REQUEST);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint guard_probe");

    // **Which control fires, measured rather than assumed** — and it is the order `3e` recorded: with the
    // pseudonymiser gone, `prevent_safeguarding_record_loss()` catches the foreign key's own `set null` first;
    // the CHECK is the belt behind it, and `int.safeguarding-erasure` is where the guards-removed case lives.
    // What matters to THIS suite is the erasure job's answer, which is a refusal either way.
    expect(message).toMatch(
      /may not be re-pointed or detached|subject_present_check/,
    );
    // Nothing committed: the request is still open, so the sweep will pick it up rather than a person being told
    // her account was erased when it was not.
    const request = await one<{ state: string }>(
      "select state from public.account_erasure_requests where id = $1",
      [G_REQUEST],
    );
    expect(request?.state).toBe("requested");
    const verification = await one<{ dbs_outcome: string; nanny_id: string }>(
      "select dbs_outcome, nanny_id from public.verifications where id = $1",
      [G_VERIFICATION],
    );
    expect(verification?.dbs_outcome).toBe("barred");
    expect(verification?.nanny_id).toBe(G_NANNY);
  });

  it("★ a request row belonging to somebody else is refused (security pass MEDIUM)", async () => {
    // Every caller in the tree derives the subject and the request from one source, so this pair is unreachable
    // through any road that exists. `service_role` holds EXECUTE on the function, though, and ADR-145's invariant
    // belongs where the write happens rather than at the call sites that happen to exist today. Without the
    // guard, this call would mark somebody else's still-open request `completed` with this subject's table list —
    // a corrupted Art 12 ledger, written by the job whose whole purpose is to be that ledger.
    await db.query("savepoint mismatch_probe");
    let message = "the mismatched pair was ACCEPTED";
    try {
      await erase(G_USER, R_REQUEST);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint mismatch_probe");
    expect(message).toContain("ERASURE_REQUEST_SUBJECT_MISMATCH");
  });

  it("an unknown subject raises rather than silently doing nothing", async () => {
    await db.query("savepoint unknown_probe");
    let message = "an unknown subject was ACCEPTED";
    try {
      await erase("00000000-0000-4000-8000-00000000dead", G_REQUEST);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint unknown_probe");
    expect(message).toContain("ERASURE_SUBJECT_NOT_FOUND");
  });
});

describe("int.account-erasure — who may run it (ADR-180)", () => {
  const ASSUMABLE_ROLES = ["anon", "authenticated", "authenticator"] as const;

  it("★ no client role may EXECUTE the job, and none may reach step 5's escalation", async () => {
    for (const role of ASSUMABLE_ROLES) {
      const { rows } = await db.query<{
        erase: boolean;
        scrub: boolean;
        collect: boolean;
      }>(
        `select has_function_privilege($1, 'public.erase_account(uuid, uuid, jsonb)', 'execute') as erase,
                has_function_privilege($1, 'public.scrub_auth_user(uuid)', 'execute') as scrub,
                has_function_privilege($1, 'public.collect_erasure_objects(uuid)', 'execute') as collect`,
        [role],
      );
      expect({ role, ...rows[0] }).toEqual({
        role,
        erase: false,
        scrub: false,
        collect: false,
      });
    }
  });

  it("★ `service_role` may call the job and may NOT call the escalation inside it", async () => {
    const { rows } = await db.query<{ erase: boolean; scrub: boolean }>(
      `select has_function_privilege('service_role', 'public.erase_account(uuid, uuid, jsonb)', 'execute') as erase,
              has_function_privilege('service_role', 'public.scrub_auth_user(uuid)', 'execute') as scrub`,
    );
    // The application reaches the erasure only through the one RPC. It cannot tombstone or ban an account by
    // itself, which is what keeps step 5 from being a way to lock anybody out.
    expect(rows[0]).toEqual({ erase: true, scrub: false });
  });

  it("★ `service_role` is still not a member of `bbldn_retention` — the reason the exemption is safe", async () => {
    const { rows } = await db.query<{ member: boolean }>(
      "select pg_has_role('service_role', 'bbldn_retention', 'member') as member",
    );
    expect(rows[0].member).toBe(false);
  });

  it("the job runs as the retention identity and not as its caller", async () => {
    const { rows } = await db.query<{ owner: string; definer: boolean }>(
      `select r.rolname as owner, p.prosecdef as definer
         from pg_proc p join pg_roles r on r.oid = p.proowner
        where p.oid = to_regprocedure('public.erase_account(uuid, uuid, jsonb)')`,
    );
    expect(rows[0]).toEqual({ owner: "bbldn_retention", definer: true });
  });
});
