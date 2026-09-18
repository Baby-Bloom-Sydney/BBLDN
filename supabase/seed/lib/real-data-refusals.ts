// Gate 2 of the seed's production refusal: **what does the target database itself say?**
//
// `targetRefusals` reads the process and the URL; both can be wrong at once (a mistyped `SUPABASE_DB_URL` on a
// laptop is exactly that case, and it defeats every environment check there is). So the database is asked
// directly, and the question is CLAUDE.md §3's own line for when the relaxed process ends — *does real data
// exist?* If one person in there is not a seeded test user, this is not a database the seed may write to.
//
// `ALREADY_SEEDED` is the third refusal, and it is a kindness rather than a guard: a second run would collide
// on the deterministic ids and fail halfway through, leaving a half-written world. `supabase db reset` is the
// way back.
import type { Client } from "pg";
import { TEST_USER_DOMAIN } from "../../../src/modules/config/testUserDomain.ts";
import { SEED_ID_PREFIX } from "./synthetic-person.ts";
import type { Refusal } from "./types.ts";

type Counts = {
  readonly real_people: string;
  readonly off_domain: string;
  readonly seeded: string;
};

export async function realDataRefusals(
  db: Client,
): Promise<ReadonlyArray<Refusal>> {
  const { rows } = await db.query<Counts>(
    `select (select count(*) from public.user_profiles where not is_test_user) real_people,
            (select count(*) from auth.users where email is null or email not like $1) off_domain,
            (select count(*) from auth.users where id::text like $2) seeded`,
    [`%@${TEST_USER_DOMAIN}`, `${SEED_ID_PREFIX}%`],
  );
  const counts = rows[0];
  const refusals: Refusal[] = [];
  if (Number(counts.real_people) > 0)
    refusals.push({
      code: "REAL_PERSON_PRESENT",
      reason: `${counts.real_people} profile(s) are not test users — this database holds real data`,
    });
  if (Number(counts.off_domain) > 0)
    refusals.push({
      code: "REAL_ACCOUNT_PRESENT",
      reason: `${counts.off_domain} account(s) live outside the test-user domain (${TEST_USER_DOMAIN})`,
    });
  if (Number(counts.seeded) > 0)
    refusals.push({
      code: "ALREADY_SEEDED",
      reason: `${counts.seeded} seeded account(s) are already here — run \`supabase db reset\` first`,
    });
  return refusals;
}
