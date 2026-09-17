// `GET /api/health` — the uptime probe's endpoint (06 §7.3 row 12) and the read 06 §4.5's promote verify makes.
// Answers the 01 §4c envelope, `{ data: { sha, env, db }, requestId }` with `x-request-id` (ADR-121 — the
// document wins over F-c's "least informative route"):
//   · `sha`  Vercel's own `VERCEL_GIT_COMMIT_SHA`, read through `config` (the one `process.env` reader, 01 §1.3
//            rule 1); `"unknown"` off Vercel, so a laptop run never impersonates a deploy.
//   · `env`  the resolved 06 §2.5 column (ADR-108).
//   · `db`   one real read through the data port (03 §1.4) — **fail-closed**: an unconfigured port, an unreachable
//            Supabase or a driver error all answer `"failed"`, never `"ok"`. The read is `areas`, the one table
//            anonymous RLS lets the app see (02 §4.1), so the probe proves the same road a page uses.
// Unauthenticated by definition (06 §7.3), so it carries nothing the runbook does not ask for. Still owed to the
// boot-file unit: the rate limit 06 §7.3 names (`configureRateLimiter` has no shared store yet).
import { auth } from "@/modules/auth";
import type { NamedOperation } from "@/modules/auth";
import { env } from "@/modules/config/server";
import type { Environment } from "@/modules/config";
import { log, ok, toResponse } from "@/modules/platform";
import { requestIdOf } from "../_lib/request-id";

export const dynamic = "force-dynamic";

const UNKNOWN_SHA = "unknown";

type DbProbe = "ok" | "failed";

type HealthReport = {
  readonly sha: string;
  readonly env: Environment;
  readonly db: DbProbe;
};

/** The "one trivial Supabase read" of 06 §7.3: `select area from areas`, under anonymous RLS. */
const HEALTH_PROBE: NamedOperation<ReadonlyArray<unknown>> = Object.freeze({
  name: "platform.health-probe",
  exec: (q) => q.from("areas").select(["area"]),
});

async function probeDatabase(requestId: string): Promise<DbProbe> {
  const result = await auth.data.run(HEALTH_PROBE);
  if (result.ok) return "ok";
  // 06 §7.3 row 8: the provider watch matches on `ALERT_PROVIDER_DOWN` + `provider`. Reason only — never the
  // driver's text (01 §4a rule 1; the port already reduced it to a `Result`).
  log.error("health: database probe failed", {
    requestId,
    action: "health",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    reason: result.error.details?.reason ?? null,
  });
  return "failed";
}

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
  const db = await probeDatabase(requestId);
  const report: HealthReport = {
    sha: env.server.VERCEL_GIT_COMMIT_SHA || UNKNOWN_SHA,
    env: env.environment,
    db,
  };
  return toResponse(ok(report), { requestId });
}
