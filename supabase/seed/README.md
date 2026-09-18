# The development seed

`npm run seed:dev` — makes a local (or, deliberately, a named preview) database useful. Owner: `06-runbook.md` §2.3; TRIAGE row `12.09`, built by the `2f` unit. Proven by `int.seed`
(`supabase/__tests__/seed.test.ts`), which applies the whole thing to the runner's own stack and rolls it back.

## What it refuses, and why that is the point

A seed writes **people**. A seed that can run against production is a defect, not a convenience, so three
independent gates must all be silent before a single row is written, and the whole run is one transaction:

| Gate                                                              | Where                       | What it asks                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRODUCTION_ENVIRONMENT`                                          | `lib/target-refusals.ts`    | does the environment resolve to production? Uses `resolveEnvironment` — the signal the boot itself reads (06 §2.1) — imported, never re-implemented.                                                                              |
| `REMOTE_TARGET_NOT_ALLOWED`                                       | `lib/target-refusals.ts`    | is the target the local stack, or a project ref a human named in `BBLDN_SEED_ALLOWED_PROJECT_REFS`? An **allow-list**: a deny-list of production refs is one new project away from being wrong and silent.                        |
| `REAL_PERSON_PRESENT` · `REAL_ACCOUNT_PRESENT` · `ALREADY_SEEDED` | `lib/real-data-refusals.ts` | does the **database itself** hold a profile that is not a test user, an account off the test-user domain, or a previous seed? A mistyped `SUPABASE_DB_URL` defeats every environment check there is; this one it does not defeat. |

`supabase db reset` is the way back. There is no un-seed.

## Nobody in it is real

- addresses on `config.testUserDomain` (`example.test`, reserved by RFC 6761), never a deliverable mailbox;
- mobiles inside **Ofcom's reserved drama range**, 07700 900000–900999, built from `LOCALE.phonePrefix`;
- DBS certificate numbers of the config shape (`VETTING.dbsCertificateNumber` — 12 digits, fixed by `2b`,
  which is why `12.09` was sequenced after it) drawn from a visibly synthetic block: eight zeros and a
  counter. No certificate was ever read, so none could be copied;
- `is_test_user` on every profile at insert time, not by a later sweep (ADR-024);
- **no document object, no URL, no share code** — I-V7 forbids bytes and URLs in those columns and the seed
  has nothing to point at. The evidence screens show a submission with nothing behind it, which is the honest
  state of a database in which no document has ever been uploaded;
- `districts` read from `areas` (02 §4.2 row 1), never invented.

## What it writes, and why that shape

08 §3's nanny-supply question in miniature. 08 §3.4 fixes the launch gate at 25 verified nannies and then says
the number that decides anything is the **per-area** floor — a pool all in one borough is no supply at all for
a family in another. So:

|                   | Count           | Why                                                                                                                                                                                          |
| ----------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| areas             | 5               | evenly spaced across active `areas` rows, so the pool is spread the way the launch gate cares about                                                                                          |
| pool nannies      | 25 (5 per area) | `MATCHING.quickMatch.topCount + 2` per area, so a quick match in a seeded area returns a full set rather than one lonely card                                                                |
| — of those, at L4 | 5 (1 per area)  | exercises the Update Service road and the hold release; the rest sit at L3, which is what "in the pool" means (`MATCHING.minVerificationLevel`)                                              |
| state nannies     | 7               | one per state the admin queue and the level model must tell apart: `submitted` · `needs-admin` · `level-2` · `level-3` · `level-4` · `barred` · `held`                                       |
| isolated nanny    | 1               | ADR-017 / I-5 — created by a child invite, out of every candidate set until she applies from her portal                                                                                      |
| parents           | 2               | one with an OPEN position in the first seeded area (so matching has demand to match); one with a CONNECTING position carrying the held connection                                            |
| held connections  | 1               | the silent hold (ADR-158) is invisible by construction and is the likeliest launch-week collision (08 §3.4) — a database where nobody is held is one where nothing about it can be looked at |
| admin             | 1               | written first: an L4 Update Service check and a recorded decision both name the admin who made them (`dbs_update_service_checked_by`, `vetting_submissions.decided_by`)                      |

**No level is written by hand.** The seed writes section columns and then calls
`sync_nanny_verification_state()` — 0023's one level writer (ADR-157) — with the same `p_required` `src/boot`
computes from the same config. If the seed could assert a level, it would be the first place London's level
model silently forked.

## Not seeded, and where that is owed

06 §2.3's list also named a family in trial and a paid bundle, and positions parked at each call state. They
need `scheduling` rows (a calendar, a booking — `nanny_positions`' D-3 CHECK makes `slot-chosen` impossible
without one) and the `payments` spine. `2f`'s brief scopes this seed to the supply question and "parents and
positions only as far as the matching screens need", so those are **not here**; the unit that next needs a
seeded call queue or a seeded bundle adds them, and 06 §2.3 records that.

## Layout

```
run.mts                        the entry: gates → connect → one transaction → report
lib/target-refusals.ts         gate 1 — the environment signal and the database URL (pure)
lib/real-data-refusals.ts      gate 2 — what the target database says about itself
lib/pick-seed-areas.ts         real London areas, evenly spaced, from `areas`
lib/seed-plan.ts               the counts, from config (pure)
lib/synthetic-person.ts        one invented person: id, name, address, mobile (pure)
lib/synthetic-dbs-number.ts    a certificate number of the right shape from a synthetic block (pure)
lib/verification-columns.ts    what each state IS, in columns — no level (pure)
lib/verification-values.ts     those columns as the row's values (pure)
lib/apply-seed.ts              the plan applied; takes a client, owns no transaction
lib/write-person.ts            account → role → profile
lib/write-seeded-nanny.ts      person → nanny → consent → verification → the sync
lib/write-verification-row.ts  the `verifications` row and its provider ledger row
lib/write-parent-world.ts      the two families, their positions, the held connection
lib/types.ts                   the type group
```
