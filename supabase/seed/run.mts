#!/usr/bin/env node
// `npm run seed:dev` — the development seed (06 §2.3; TRIAGE `12.09`).
//
// **Opt-in by construction.** Nothing runs this for you: it is not `supabase/seed.sql`, so `supabase db reset`
// does not load it, and CI's integration job — which resets a stack of its own — never sees it. You ask for it.
//
// **It refuses production, twice over.** `targetRefusals` reads the environment signal the boot itself reads
// and checks the target against an allow-list; `realDataRefusals` asks the database whether anybody in it is
// real. Both must be silent before a single row is written, and the whole seed runs in one transaction, so a
// refusal or a failure leaves the database exactly as it found it.
//
// Everybody it writes is invented: `@example.test` addresses, Ofcom drama-range mobiles, DBS certificate
// numbers of the config shape from a visibly synthetic block, `is_test_user` on every profile.
import { Client } from "pg";
import { applySeed } from "./lib/apply-seed.ts";
import { pickSeedAreas } from "./lib/pick-seed-areas.ts";
import { realDataRefusals } from "./lib/real-data-refusals.ts";
import { seedPlan } from "./lib/seed-plan.ts";
import { targetRefusals } from "./lib/target-refusals.ts";
import type { Refusal } from "./lib/types.ts";

/** `supabase start`'s default, the same constant `supabase/__tests__/db-client.ts` carries. */
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
/** How many real London areas the pool is spread over (08 §3.4: coverage, not just a total). */
const AREA_COUNT = 5;

function refuse(refusals: ReadonlyArray<Refusal>): never {
  console.error("seed: refused — nothing was written.");
  for (const r of refusals) console.error(`  · ${r.code}: ${r.reason}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL ?? LOCAL_DB_URL;
  const target = targetRefusals(process.env, url);
  if (target.length > 0) refuse(target);

  const db = new Client({
    connectionString: url,
    ssl: url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await db.connect();
  try {
    const real = await realDataRefusals(db);
    if (real.length > 0) refuse(real);
    await db.query("begin");
    const report = await applySeed(
      db,
      seedPlan(await pickSeedAreas(db, AREA_COUNT)),
    );
    await db.query("commit");
    console.log("seed: done.");
    console.log(
      `  areas   ${report.areas.map((a) => `${a.area} (${a.district})`).join(", ")}`,
    );
    for (const [name, n] of Object.entries(report.counts))
      console.log(`  ${name.padEnd(20)}${n}`);
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

await main();
