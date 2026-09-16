// `stub-auth` (03 §1.4; 05 §3 rule 1; swap test 03 §11 row 9) — production code inside the module it stubs,
// exporting the connector type and nothing else. Delete every `@supabase/*` line in `lib/` and this still gives a
// working `Auth`: in-memory sessions and a test schema behind the same port, selected by `configureAuth` and never
// by an import edit (05 §3 rule 3).
import type { AppDatabase, Auth, StubAuthOptions } from "./types";
import { createAuth } from "./lib/create-auth";
import { memoryAuthDriver } from "./lib/memory-auth-driver";

export function stubAuth(options: StubAuthOptions = {}): Auth<AppDatabase> {
  return createAuth({ driver: memoryAuthDriver(options) });
}
