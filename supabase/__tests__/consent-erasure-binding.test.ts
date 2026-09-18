// `int.consent-erasure-binding` — `3c` (L-009). Three claims this merge rests on, each executable against the
// applied set, plus the four cascades this unit audited and deliberately did not change.
//
//   1. **The draft seed exists and says it is a draft.** `0026` gives every day-one slug a v1 body, and every one
//      of them carries `DRAFT — not legal advice, pending review`. The assertion is not decoration: L-009's
//      kickoff §3 forbids any unit from shipping a legal document as if it were final, and this is the control
//      that keeps that true until a solicitor's text replaces it. When `3a` lands ratified wording it lands as
//      **version 2**, so this suite keeps judging v1 and keeps passing — the day someone edits v1 in place
//      instead, it fails, which is exactly the mistake worth catching.
//   2. **Ruling 5.1 — a signature binds to the version AND the words.** A consent row names
//      `(document_id, version, content_hash)`; a row naming a hash the version never had is refused by the
//      database, not by a code path anyone can forget to call.
//   3. **ADR-170, the consent half — an erasure is refused, never silent.** Deleting an `auth.users` row whose
//      subject holds consent evidence raises, and the evidence is still there afterwards. The product path is
//      07 §6.1's scrub-and-retain; this is the backstop for the emergency hard delete.
//
// The four PINNED cases at the end are ADR-170's **other** half — the safeguarding cascades. They are audited,
// reported in L-009 PROGRESS, and left to their own unit on purpose: they are `verification` / `vetting`
// schema, they interact with ADR-168's terminal bar and with `0008` / `0023` / `0025`'s verify blocks and twins,
// and a schema-wide erasure change riding inside a consent unit is how a safeguarding regression ships unseen.
// They are pinned rather than written down so the defect cannot decay into a note nobody reads.
import { createHash } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const DRAFT_MARK = "DRAFT — not legal advice, pending review";

/** 02 §4.1 row 4's day-one slugs — the same list `0003`'s CHECK and `0026`'s verify block carry. */
const DAY_ONE_SLUGS = [
  "client-tos",
  "professional-tos",
  "privacy-policy",
  "biometric-notice",
  "code-of-conduct",
  "cookie-policy",
  "disclaimer",
  "parent-app-consent",
  "nanny-attestation",
  "media-consent",
  "agr14_nanny_child_add",
] as const;

const SUBJECT = "000000c0-0000-4000-8000-000000000000";

let db: Client;

/**
 * Run a statement that is expected to be refused, inside a savepoint. Without this, the first refusal aborts the
 * suite's transaction and every later case answers "current transaction is aborted" — which reads as six new
 * failures and is really one. Returns the error message.
 */
async function refused(
  sql: string,
  params: readonly unknown[],
): Promise<string> {
  await db.query("savepoint attempt");
  try {
    await db.query(sql, [...params]);
  } catch (error) {
    await db.query("rollback to savepoint attempt");
    return error instanceof Error ? error.message : String(error);
  }
  await db.query("rollback to savepoint attempt");
  throw new Error("the statement was accepted; it should have been refused");
}

async function onDelete(table: string, column: string): Promise<string> {
  const { rows } = await db.query<{ action: string }>(
    `select c.confdeltype::text as action
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
      where n.nspname = 'public' and t.relname = $1 and c.contype = 'f'
        and array_length(c.conkey, 1) = 1 and a.attname = $2`,
    [table, column],
  );
  return rows[0]?.action ?? "none";
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             'consent-subject@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [SUBJECT],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [SUBJECT],
  );
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.consent — the seed is a draft, and says so (L-009 kickoff §3)", () => {
  it.each(DAY_ONE_SLUGS)(
    "%s has a v1 body marked as a draft, not legal advice, pending review",
    async (slug) => {
      const { rows } = await db.query<{ body_md: string }>(
        `select body_md from public.legal_documents where document_id = $1 and version = 1`,
        [slug],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].body_md).toContain(DRAFT_MARK);
    },
  );

  it("every v1 content_hash is the sha256 of the body it ships with, not a typed string", async () => {
    const { rows } = await db.query<{ body_md: string; content_hash: string }>(
      `select body_md, content_hash from public.legal_documents where version = 1`,
    );
    expect(rows).toHaveLength(DAY_ONE_SLUGS.length);
    for (const row of rows)
      expect(row.content_hash).toBe(
        createHash("sha256").update(row.body_md, "utf8").digest("hex"),
      );
  });

  it("no day-one slug is missing — a missed one is one consent road failing `document-required` in production", async () => {
    const { rows } = await db.query<{ document_id: string }>(
      `select document_id from public.legal_documents where version = 1 order by document_id`,
    );
    expect(rows.map((row) => row.document_id)).toEqual(
      [...DAY_ONE_SLUGS].sort(),
    );
  });
});

describe("int.consent — ruling 5.1: a signature binds to the version AND the words", () => {
  const insert = (version: number, hash: string) =>
    db.query(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, document_id, document_version,
          document_content_hash, consent_given, purpose)
       values ($1, 'parent', 'AGR-01', 'agr01_terms_acceptance', 'I agree.', 'client-tos', $2, $3, true, 'client-tos')`,
      [SUBJECT, version, hash],
    );

  it("accepts a consent that names the current version and its real hash", async () => {
    const { rows } = await db.query<{ content_hash: string }>(
      `select content_hash from public.legal_documents where document_id = 'client-tos' and version = 1`,
    );
    await expect(insert(1, rows[0].content_hash)).resolves.toBeDefined();
  });

  it("★ refuses a consent naming a hash that version never had — the database refuses it, not a code path", async () => {
    const message = await refused(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, document_id, document_version,
          document_content_hash, consent_given, purpose)
       values ($1, 'parent', 'AGR-01', 'agr01_terms_acceptance', 'I agree.', 'client-tos', 1, $2, true, 'client-tos')`,
      [SUBJECT, "0".repeat(64)],
    );
    expect(message).toMatch(/consent_records_document_fkey/);
  });

  it("★ refuses a consent that names a version but no words at all (ruling 5.1, every writer)", async () => {
    const message = await refused(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, document_id, document_version,
          consent_given, purpose)
       values ($1, 'parent', 'AGR-01', 'agr01_terms_acceptance', 'I agree.', 'client-tos', 1, true, 'client-tos')`,
      [SUBJECT],
    );
    expect(message).toMatch(/document_content_hash/);
  });

  it("the biometric notice binds the same way, because Art 9(2)(a) consent is explicit or it is nothing", async () => {
    expect(await onDelete("biometric_consent_records", "user_id")).toBe("r");
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'biometric_consent_records'
          and c.conname = 'biometric_consent_records_notice_fkey'
          and array_length(c.conkey, 1) = 3`,
    );
    expect(rows[0].n).toBe("1");
  });
});

describe("int.consent — ADR-170 (the consent half): erasure is refused, never silent", () => {
  it("★ deleting the subject's auth.users row RAISES while a consent record stands", async () => {
    const message = await refused(`delete from auth.users where id = $1`, [
      SUBJECT,
    ]);
    expect(message).toMatch(/consent_records/);
  });

  it("the consent record is still there afterwards — a refusal, not a silent cascade", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.consent_records where user_id = $1`,
      [SUBJECT],
    );
    expect(Number(rows[0].n)).toBeGreaterThan(0);
  });

  it.each([
    ["consent_records", "user_id"],
    ["biometric_consent_records", "user_id"],
  ])(
    "%s.%s is ON DELETE RESTRICT, matching 0010's money tables",
    async (table, column) => {
      expect(await onDelete(table, column)).toBe("r");
    },
  );

  it("cookie consent keeps `set null` — the record survives de-linked, which is right for a visitor row", async () => {
    expect(await onDelete("cookie_consent_records", "user_id")).toBe("n");
  });
});

/**
 * PINNED — ADR-170's **other** half, audited by `3c` and left to its own unit.
 *
 * One `delete from auth.users` today propagates `auth.users → nannies → verifications → vetting_submissions`
 * and `→ nanny_suspension_lifts`, and none of those tables carries `prevent_row_modification()`, so nothing
 * stands in the way for any role. The complete safeguarding history of a person who cared for children — which
 * admin approved her DBS check, what the outcome was, who lifted a bar and why — is erased by one statement,
 * and `nanny_suspension_lifts` does this while its *other* person key, `decided_by`, is already `restrict` with
 * a written justification: *"an audit row whose author can be deleted is not an audit row."* The reasoning was
 * applied to the author of the lift and not to its subject.
 *
 * Red on the shipped tree; green when the four keys stop cascading from a person.
 * **Owner: the `verification` / `vetting` schema unit (ADR-170's safeguarding half).** L-009 PROGRESS carries
 * the full 131-row cascade audit and the recommendation that this is its own unit.
 */
describe("int.consent — PINNED: ADR-170's safeguarding half (owner: the verification/vetting schema unit)", () => {
  it.fails(
    "★ PINNED — verifications.nanny_id must not cascade from a person (ADR-170)",
    async () => {
      expect(await onDelete("verifications", "nanny_id")).not.toBe("c");
    },
  );

  it.fails(
    "★ PINNED — vetting_submissions.nanny_id must not cascade from a person (ADR-170)",
    async () => {
      expect(await onDelete("vetting_submissions", "nanny_id")).not.toBe("c");
    },
  );

  it.fails(
    "★ PINNED — vetting_submissions.verification_id must not carry the second path to the same deletion (ADR-170)",
    async () => {
      expect(await onDelete("vetting_submissions", "verification_id")).not.toBe(
        "c",
      );
    },
  );

  it.fails(
    "★ PINNED — nanny_suspension_lifts.nanny_id must not cascade: its own decided_by is already restrict (ADR-168, ADR-170)",
    async () => {
      expect(await onDelete("nanny_suspension_lifts", "nanny_id")).not.toBe(
        "c",
      );
    },
  );
});
