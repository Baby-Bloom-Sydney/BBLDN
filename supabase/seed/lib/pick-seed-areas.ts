// The seed invents no geography. `areas` is the one source (02 §4.2 row 1, seeded by `0001` from the real
// Greater London district set), so the seed *reads* it and spreads its people over what is actually there.
//
// Evenly spaced rather than the first N: the first N districts alphabetically are all in one outer borough,
// and a pool that is 25 nannies in one borough is 08 §3.4's "zero supply for a parent in another" — the exact
// failure the launch gate's per-area floor exists to catch. A seed that reproduces the failure is more useful
// than one that hides it.
import type { Client } from "pg";
import type { SeedArea } from "./types.ts";

export async function pickSeedAreas(
  db: Client,
  count: number,
): Promise<ReadonlyArray<SeedArea>> {
  const { rows } = await db.query<SeedArea>(
    `select distinct on (area) district, area
       from public.areas
      where is_active
      order by area, district`,
  );
  if (rows.length < count)
    throw new Error(
      `seed: only ${rows.length} active area(s) in \`areas\` — ${count} wanted; is 0001 applied?`,
    );
  const step = Math.floor(rows.length / count);
  return Object.freeze(Array.from({ length: count }, (_, i) => rows[i * step]));
}
