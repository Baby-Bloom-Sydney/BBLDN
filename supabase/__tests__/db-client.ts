// The one database handle the integration suites share (05 §4.2 `db.constraints`, `int.rls`).
// Not a module under `src/`: these suites talk to the applied migrations, not to the app, and the
// boundary lint's one-export rule does not reach `supabase/`.
//
// The URL is the local stack's (`supabase start`, 05 §9 stage 5) unless SUPABASE_DB_URL overrides
// it, which is how the same suites run against `bb-ldn-preview`.
import { Client } from "pg";

/** `supabase start`'s default, printed by `supabase status` as DB URL. */
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function dbUrl(): string {
  return process.env.SUPABASE_DB_URL ?? LOCAL_DB_URL;
}

export async function connect(): Promise<Client> {
  const url = dbUrl();
  const client = new Client({
    connectionString: url,
    // the hosted pooler presents a Supabase certificate; the local stack has none
    ssl: url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  return client;
}
