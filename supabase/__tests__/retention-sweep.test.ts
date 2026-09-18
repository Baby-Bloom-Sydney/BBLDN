// `int.retention-sweep` — 07 §6.2 against the applied set (L-009 `3h`; `3g`'s Q-1).
//
// **Every class is proved by execution, at its boundary.** For each acting class the suite seeds three rows —
// one comfortably inside the window, one on the boundary, one outside it — runs the sweep, and asserts that the
// inside and boundary rows are untouched and the outside row got **exactly** the treatment its config entry
// names. Where 07 §6.2 says null and keep, the row is still there with those columns null; where it says delete,
// the row is gone and its siblings are not.
//
// **The boundary is the first instant inside the window, not a literal equality.** `0031` computes its cutoff
// from `now()` at call time, which is milliseconds after the fixture computed its own, so a row placed at
// exactly `now() - window` would be a coin toss. One second inside is the honest way to drive a strict `<`.
//
// **The specs are the real ones.** `retentionSpecs()` is imported rather than restated, so this suite exercises
// the same window and anchors the cron passes — a class whose config entry drifts from 07 §6.2 fails here as
// well as in the gate.
//
// **And then the one this unit exists for**: `purge-scrubbed-users` refuses `rows-outstanding` for ever once its
// windows have passed, because nothing removed the expired rows. The last describe seeds exactly that subject,
// measures the refusal, runs the sweep, and measures the purge succeeding. It is a test, not a claim.
import { config as loadEnv } from "dotenv";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { seedFixtures, type Fixtures } from "./rls-fixtures";

const LIMIT = 500;

let db: Client;
let fx: Fixtures;
let seq = 0;

/**
 * The **real** specs, imported rather than restated — so a class whose config entry drifts from 07 §6.2 fails
 * here and not only in the gate. `config/env.ts` parses at import, so `.env.test` is loaded first and the import
 * is deferred to `beforeAll`: the alternative was a second copy of every window in this file, which is the one
 * thing ADR-179 exists to prevent.
 */
let specs: ReadonlyArray<{
  readonly class: string;
  readonly spec: { readonly window: unknown; readonly anchors: unknown };
}>;

const specOf = (name: string) => {
  const found = specs.find((entry) => entry.class === name);
  if (found === undefined)
    throw new Error(`${name} is not an acting class in config/retention.ts`);
  return found.spec;
};

/** The window as a SQL interval, taken from config rather than typed here. */
function interval(name: string): string {
  const window = specOf(name).window as {
    readonly months?: number;
    readonly days?: number;
  } | null;
  if (window === null) throw new Error(`${name} has no window`);
  return window.months !== undefined
    ? `interval '${window.months} months'`
    : `interval '${window.days} days'`;
}

/** Outside the window by a day — this row must be treated. */
const outside = (name: string) =>
  `now() - ${interval(name)} - interval '1 day'`;
/** The first instant inside the window — this row must survive a strict `<`. */
const boundary = (name: string) =>
  `now() - ${interval(name)} + interval '1 second'`;
/** Comfortably inside. */
const inside = () => `now()`;

type Answer = {
  class: string;
  removed: number;
  nulled: number;
  capped: boolean;
};

async function sweep(name: string, limit = LIMIT): Promise<Answer> {
  const { rows } = await db.query<{ answer: Answer }>(
    `select public.retention_sweep_class($1, $2::jsonb, $3) as answer`,
    [name, JSON.stringify(specOf(name)), limit],
  );
  return rows[0].answer;
}

/** A scrubbed subject with a completed erasure, for the two classes anchored on the scrub. */
async function scrubbedSubject(scrubbedAt: string): Promise<string> {
  seq += 1;
  const id = `000000f${seq.toString(16)}-0000-4000-8000-000000000001`;
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             banned_until, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, null, now(), '{}'::jsonb, '{}'::jsonb, 'infinity', now(), now())`,
    [id, `deleted+${id}@invalid`],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [id],
  );
  await db.query(
    `insert into public.account_erasure_requests (subject_user_id, road, state, completed_at)
     values ($1, 'self-service', 'completed', ${scrubbedAt})`,
    [id],
  );
  return id;
}

/** A live user with no erasure at all — the money class is anchored on transactions, not on a scrub. */
async function liveSubject(): Promise<string> {
  seq += 1;
  const id = `000000d${seq.toString(16)}-0000-4000-8000-000000000001`;
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, `live-${seq}@example.test`],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [id],
  );
  return id;
}

beforeAll(async () => {
  loadEnv({ path: ".env.test", quiet: true });
  ({ retentionSpecs: specs } = await (async () => {
    const platform = await import("@/modules/platform");
    return { retentionSpecs: platform.retentionSpecs() };
  })());
  db = await connect();
  await db.query("begin");
  fx = await seedFixtures(db);
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.retention-sweep — the boundary, per class", () => {
  it("★ row 13: `email_logs` bodies are nulled at 90 days and the row is kept", async () => {
    await db.query("savepoint s");
    for (const [key, at] of [
      ["old", outside("email-bodies")],
      ["edge", boundary("email-bodies")],
      ["new", inside()],
    ] as const)
      await db.query(
        `insert into public.email_logs (template_id, channel, subject, body_html, body_text, status, sent_at)
         values ($1, 'email', 'a subject', '<p>body</p>', 'body', 'sent', ${at})`,
        [`retention-${key}`],
      );

    const answer = await sweep("email-bodies");

    expect(answer).toMatchObject({ nulled: 1, removed: 0, capped: false });
    const { rows } = await db.query(
      `select template_id, subject, body_html, body_text from public.email_logs
        where template_id like 'retention-%' order by template_id`,
    );
    // The row survives in every case — 07 §6.2 nulls here, and deleting would be a different promise.
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.template_id === "retention-old")).toMatchObject({
      subject: null,
      body_html: null,
      body_text: null,
    });
    expect(rows.find((r) => r.template_id === "retention-edge")?.subject).toBe(
      "a subject",
    );
    expect(rows.find((r) => r.template_id === "retention-new")?.subject).toBe(
      "a subject",
    );

    await db.query("rollback to savepoint s");
  });

  it("★ row 13: the `email_logs` row itself goes at 24 months", async () => {
    await db.query("savepoint s");
    for (const [key, at] of [
      ["old", outside("email-metadata")],
      ["edge", boundary("email-metadata")],
      ["new", inside()],
    ] as const)
      await db.query(
        `insert into public.email_logs (template_id, channel, status, sent_at)
         values ($1, 'email', 'sent', ${at})`,
        [`retention-${key}`],
      );

    const answer = await sweep("email-metadata");

    expect(answer).toMatchObject({ removed: 1, nulled: 0 });
    const { rows } = await db.query(
      `select template_id from public.email_logs where template_id like 'retention-%' order by template_id`,
    );
    expect(rows.map((r) => r.template_id)).toEqual([
      "retention-edge",
      "retention-new",
    ]);

    await db.query("rollback to savepoint s");
  });

  it("★ row 13: an acknowledged admin notification goes at 12 months", async () => {
    await db.query("savepoint s");
    for (const at of [
      outside("admin-notifications"),
      boundary("admin-notifications"),
      inside(),
    ])
      await db.query(
        `insert into public.admin_notifications (kind, summary, acknowledged_at, acknowledged_by)
         values ('cron_failed', 'retention probe', ${at}, $1)`,
        [fx.admin],
      );
    // An unacknowledged notification has no anchor at all, whatever its age.
    await db.query(
      `insert into public.admin_notifications (kind, summary, created_at)
       values ('cron_failed', 'retention probe never acknowledged', now() - interval '10 years')`,
    );

    const answer = await sweep("admin-notifications");

    expect(answer).toMatchObject({ removed: 1 });
    const { rows } = await db.query(
      `select count(*)::int as n from public.admin_notifications where summary like 'retention probe%'`,
    );
    expect(rows[0].n).toBe(3);

    await db.query("rollback to savepoint s");
  });

  it("★ row 14: `events` identifiers are nulled at 25 months and the row stays", async () => {
    await db.query("savepoint s");
    for (const [key, at] of [
      ["old", outside("events-identifiers")],
      ["edge", boundary("events-identifiers")],
      ["new", inside()],
    ] as const)
      await db.query(
        `insert into public.events (name, source, actor_kind, ts, visitor_id, request_id, attribution, idempotency_key)
         values ('visit', 'client', 'visitor', ${at}, 'v-' || $1, 'r-' || $1, '{"utm":"x"}'::jsonb, $1)`,
        [`retention-${key}`],
      );

    const answer = await sweep("events-identifiers");

    expect(answer).toMatchObject({ nulled: 1, removed: 0 });
    const { rows } = await db.query(
      `select idempotency_key, visitor_id, request_id, attribution from public.events
        where idempotency_key like 'retention-%' order by idempotency_key`,
    );
    expect(rows).toHaveLength(3);
    expect(
      rows.find((r) => r.idempotency_key === "retention-old"),
    ).toMatchObject({ visitor_id: null, request_id: null, attribution: null });
    expect(
      rows.find((r) => r.idempotency_key === "retention-edge")?.visitor_id,
    ).toBe("v-retention-edge");

    await db.query("rollback to savepoint s");
  });

  it("★ row 12: a superseded cookie choice goes at 30 days, the standing one at 13 months", async () => {
    await db.query("savepoint s");
    const { rows: current } = await db.query<{ id: string }>(
      `insert into public.cookie_consent_records
         (visitor_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date, created_at)
       values ('retention-current', 'accept_all', true, true, now() + interval '1 year', now())
       returning id`,
    );
    for (const [key, at] of [
      ["old", outside("cookie-consent-superseded")],
      ["edge", boundary("cookie-consent-superseded")],
    ] as const)
      await db.query(
        `insert into public.cookie_consent_records
           (visitor_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date, created_at, superseded_by)
         values ($1, 'reject_non_essential', false, false, now() + interval '1 year', ${at}, $2)`,
        [`retention-${key}`, current[0].id],
      );

    const answer = await sweep("cookie-consent-superseded");

    expect(answer).toMatchObject({ removed: 1 });
    const { rows } = await db.query(
      `select visitor_id from public.cookie_consent_records
        where visitor_id like 'retention-%' order by visitor_id`,
    );
    expect(rows.map((r) => r.visitor_id)).toEqual([
      "retention-current",
      "retention-edge",
    ]);

    await db.query("rollback to savepoint s");
  });

  it("★ row 12: a standing cookie record goes at 13 months, and never one another row points at", async () => {
    await db.query("savepoint s");
    const { rows: pointed } = await db.query<{ id: string }>(
      `insert into public.cookie_consent_records
         (visitor_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date, created_at)
       values ('retention-pointed', 'accept_all', true, true, now() + interval '1 year',
               ${outside("cookie-consent")})
       returning id`,
    );
    await db.query(
      `insert into public.cookie_consent_records
         (visitor_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date, created_at, superseded_by)
       values ('retention-pointer', 'custom', false, false, now() + interval '1 year', now(), $1)`,
      [pointed[0].id],
    );
    for (const [key, at] of [
      ["old", outside("cookie-consent")],
      ["edge", boundary("cookie-consent")],
    ] as const)
      await db.query(
        `insert into public.cookie_consent_records
           (visitor_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date, created_at)
         values ($1, 'accept_all', true, true, now() + interval '1 year', ${at})`,
        [`retention-${key}`],
      );

    const answer = await sweep("cookie-consent");

    expect(answer).toMatchObject({ removed: 1 });
    const { rows } = await db.query(
      `select visitor_id from public.cookie_consent_records
        where visitor_id like 'retention-%' order by visitor_id`,
    );
    // The pointed-at row stays: removing it would leave `retention-pointer` naming a row that is gone.
    expect(rows.map((r) => r.visitor_id)).toEqual([
      "retention-edge",
      "retention-pointed",
      "retention-pointer",
    ]);

    await db.query("rollback to savepoint s");
  });

  it("★ row 6: a hire record goes six years after it ENDED, and a live one never", async () => {
    await db.query("savepoint s");
    for (const [notes, at, state] of [
      ["retention-old", outside("placements"), "ENDED"],
      ["retention-edge", boundary("placements"), "ENDED"],
      ["retention-live", outside("placements"), "ACTIVE"],
    ] as const)
      await db.query(
        `insert into public.nanny_placements
           (position_id, nanny_id, parent_id, source, state, ended_at, end_reason, nanny_notes)
         values ($1, $2, $3, 'invite_shell', $4, ${at}, 'natural', $5)`,
        [fx.positionA, fx.nannyVisibleId, fx.parentAId, state, notes],
      );

    const answer = await sweep("placements");

    expect(answer).toMatchObject({ removed: 1 });
    const { rows } = await db.query(
      `select nanny_notes from public.nanny_placements where nanny_notes like 'retention-%' order by nanny_notes`,
    );
    expect(rows.map((r) => r.nanny_notes)).toEqual([
      "retention-edge",
      "retention-live",
    ]);

    await db.query("rollback to savepoint s");
  });

  it("★ row 5: `raw_response` is nulled at 12 months and the decision is untouched", async () => {
    await db.query("savepoint s");
    const { rows: v } = await db.query<{ id: string }>(
      `insert into public.verifications (nanny_id, dbs_outcome) values ($1, 'cleared') returning id`,
      [fx.nannyVisibleId],
    );
    for (const [key, at] of [
      ["old", outside("provider-responses")],
      ["edge", boundary("provider-responses")],
      ["new", inside()],
    ] as const)
      await db.query(
        `insert into public.vetting_submissions
           (verification_id, nanny_id, section, evidence_type, evidence_id, provider_key, status, raw_response, checked_at)
         values ($1, $2, 'dbs', 'dbs-certificate', gen_random_uuid(), $3, 'passed', '{"raw":"x"}'::jsonb, ${at})`,
        [v[0].id, fx.nannyVisibleId, `retention-${key}`],
      );

    const answer = await sweep("provider-responses");

    expect(answer).toMatchObject({ nulled: 1, removed: 0 });
    const { rows } = await db.query(
      `select provider_key, raw_response, status, nanny_id from public.vetting_submissions
        where provider_key like 'retention-%' order by provider_key`,
    );
    // Three rows still here, and every decision intact — ruling 3, asserted rather than asserted about.
    expect(rows).toHaveLength(3);
    expect(
      rows.every((r) => r.status === "passed" && r.nanny_id !== null),
    ).toBe(true);
    expect(
      rows.find((r) => r.provider_key === "retention-old")?.raw_response,
    ).toBeNull();
    expect(
      rows.find((r) => r.provider_key === "retention-edge")?.raw_response,
    ).not.toBeNull();

    await db.query("rollback to savepoint s");
  });

  it("★ row 9: money goes six years after the LAST transaction, per subject", async () => {
    await db.query("savepoint s");
    const stale = await liveSubject();
    const recent = await liveSubject();
    for (const [id, at] of [
      [stale, outside("money")],
      [recent, outside("money")],
    ] as const)
      await db.query(
        `insert into public.parent_subscriptions (parent_user_id, status, created_at)
         values ($1, 'cancelled', ${at})`,
        [id],
      );
    // One recent payment holds the whole set: 07 §6.2 row 9 counts from the last transaction, not from each row.
    await db.query(
      `insert into public.payment_events (parent_user_id, provider, provider_event_id, event_type, payload, received_at)
       values ($1, 'stripe-uk', 'retention-recent', 'invoice.paid', '{}'::jsonb, now())`,
      [recent],
    );

    const answer = await sweep("money");

    expect(answer.removed).toBe(1);
    const { rows } = await db.query(
      `select parent_user_id from public.parent_subscriptions where parent_user_id = any($1::uuid[])`,
      [[stale, recent]],
    );
    expect(rows.map((r) => r.parent_user_id)).toEqual([recent]);

    await db.query("rollback to savepoint s");
  });

  it("★ row 11: consent goes six years after the SCRUB, and a living account's never", async () => {
    await db.query("savepoint s");
    const scrubbedLongAgo = await scrubbedSubject(outside("consent"));
    const scrubbedRecently = await scrubbedSubject(boundary("consent"));
    const living = await liveSubject();
    for (const id of [scrubbedLongAgo, scrubbedRecently, living])
      await db.query(
        `insert into public.consent_records
           (user_id, party, purpose, agreement_id, checkpoint_id, checkpoint_text, consent_given, created_at)
         values ($1, 'parent', 'privacy-policy', 'AGR-01', 'cp', 'I agree', true, now() - interval '20 years')`,
        [id],
      );

    const answer = await sweep("consent");

    // The living account's consent is twenty years old and is not touched: it has no anchor, because the
    // anchor is the scrub and there has not been one.
    expect(answer.removed).toBe(1);
    const { rows } = await db.query(
      `select user_id from public.consent_records where user_id = any($1::uuid[]) order by user_id`,
      [[scrubbedLongAgo, scrubbedRecently, living]],
    );
    expect(rows.map((r) => r.user_id).sort()).toEqual(
      [scrubbedRecently, living].sort(),
    );

    await db.query("rollback to savepoint s");
  });
});

describe("int.retention-sweep — the properties every class shares", () => {
  it("★ a second run is a no-op: the same sweep twice removes nothing the second time", async () => {
    await db.query("savepoint s");
    await db.query(
      `insert into public.email_logs (template_id, channel, status, sent_at)
       values ('retention-twice', 'email', 'sent', ${outside("email-metadata")})`,
    );

    const first = await sweep("email-metadata");
    const second = await sweep("email-metadata");

    expect(first.removed).toBe(1);
    expect(second).toMatchObject({ removed: 0, nulled: 0, capped: false });

    await db.query("rollback to savepoint s");
  });

  it("★ the batch is bounded, and a capped run says so", async () => {
    await db.query("savepoint s");
    for (let n = 0; n < 4; n += 1)
      await db.query(
        `insert into public.email_logs (template_id, channel, status, sent_at)
         values ($1, 'email', 'sent', ${outside("email-metadata")})`,
        [`retention-bounded-${n}`],
      );

    const first = await sweep("email-metadata", 2);
    const second = await sweep("email-metadata", 2);

    expect(first).toMatchObject({ removed: 2, capped: true });
    expect(second).toMatchObject({ removed: 2, capped: true });
    expect(await sweep("email-metadata", 2)).toMatchObject({
      removed: 0,
      capped: false,
    });

    await db.query("rollback to savepoint s");
  });

  it("★ a class the config defers is refused rather than quietly doing nothing", async () => {
    await db.query("savepoint s");

    await expect(
      db.query(`select public.retention_sweep_class('leads', $1::jsonb, 100)`, [
        JSON.stringify({ window: { months: 12 }, anchors: [] }),
      ]),
    ).rejects.toThrow(/is not a class this job implements/);

    await db.query("rollback to savepoint s");
  });

  it("★ an anchor column that does not exist raises — a window nobody enforces is worse than none", async () => {
    await db.query("savepoint s");

    await expect(
      db.query(
        `select public.retention_sweep_class('consent', $1::jsonb, 100)`,
        [
          JSON.stringify({
            window: { months: 72 },
            anchors: [
              { table: "account_erasure_requests", column: "complete_at" },
            ],
          }),
        ],
      ),
    ).rejects.toThrow(/does not exist/);

    await db.query("rollback to savepoint s");
  });

  it("★ no arm can reach a safeguarding decision: the identity holds no DELETE on those tables", async () => {
    const { rows } = await db.query<{ table_name: string; can: boolean }>(
      `select t as table_name, has_table_privilege('bbldn_retention', 'public.' || t, 'delete') as can
         from unnest(array['verifications','vetting_submissions','nanny_suspension_lifts']) t`,
    );
    expect(rows.map((r) => r.can)).toEqual([false, false, false]);
  });
});

describe("int.retention-sweep — ★ the purge stops refusing (3g's Q-1, closed)", () => {
  it("★ rows-outstanding before the sweep, purged after it", async () => {
    await db.query("savepoint s");
    const windows = {
      money: { months: 72, from: "last-activity" },
      consent: { months: 72, from: "scrub" },
      safeguarding: { months: 12, from: "scrub" },
    };
    // Scrubbed a decade ago, with a money row whose window passed a decade ago. Every window has run out;
    // the row is still here only because nothing removed it. This is `3g`'s measured defect exactly.
    const id = await scrubbedSubject(`'2014-01-01T00:00:00Z'::timestamptz`);
    await db.query(
      `insert into public.parent_subscriptions (parent_user_id, status, created_at)
       values ($1, 'cancelled', '2014-01-01T00:00:00Z')`,
      [id],
    );

    const before = await db.query<{
      answer: { outcome: string; reason: string };
    }>(`select public.purge_scrubbed_user($1, $2::jsonb) as answer`, [
      id,
      JSON.stringify(windows),
    ]);
    expect(before.rows[0].answer).toMatchObject({
      outcome: "refused",
      reason: "rows-outstanding",
    });

    await sweep("money");
    await sweep("consent");

    const after = await db.query<{ answer: { outcome: string } }>(
      `select public.purge_scrubbed_user($1, $2::jsonb) as answer`,
      [id, JSON.stringify(windows)],
    );
    expect(after.rows[0].answer).toMatchObject({ outcome: "purged" });

    const { rows } = await db.query(`select 1 from auth.users where id = $1`, [
      id,
    ]);
    expect(rows).toHaveLength(0);

    await db.query("rollback to savepoint s");
  });
});
