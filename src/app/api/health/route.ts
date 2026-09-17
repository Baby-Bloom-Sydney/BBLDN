// `GET /api/health` — the uptime probe's endpoint (06 §7.3 row 12) and the read 06 §4.5's promote verify makes.
// Answers the 01 §4c envelope, `{ data: { sha, env, db }, requestId }` with `x-request-id` (ADR-121 — the
// document wins over F-c's "least informative route"):
//   · `sha`  Vercel's own `VERCEL_GIT_COMMIT_SHA`, read through `config` (the one `process.env` reader, 01 §1.3
//            rule 1); `"unknown"` off Vercel, so a laptop run never impersonates a deploy.
//   · `env`  the resolved 06 §2.5 column (ADR-108).
//   · `db`   one real read through the data port (03 §1.4) — **fail-closed**: an unconfigured port, an unreachable
//            Supabase or a driver error all answer `"failed"`, never `"ok"`. The read is `areas`, the one table
//            anonymous RLS lets the app see (02 §4.1), so the probe proves the same road a page uses.
// Unauthenticated by definition (06 §7.3), so it carries nothing the runbook does not ask for.
//
// **ADR-130 — the status is the signal, the body is the report.** A failed probe answers **503** with the same
// `{ data: { sha, env, db: "failed" } }` body. Uptime and readiness probes (Better Stack per ADR-106, Vercel's
// own checks, 06 §7.1) alert on status codes, not on parsing a body: a 200 carrying a dead dependency is a
// monitor that never fires. The body is not narrowed to compensate — the runbook still reads which dependency
// failed off `db`. The response is built here rather than through `toResponse` because 01 §4c's envelope pairs a
// 5xx with an `error` body, and this is deliberately a **success body with a readiness status**; bending
// `EnvelopeOptions` to admit 503 would let any route return a success envelope under a server error.
import { auth } from "@/modules/auth";
import type { NamedOperation } from "@/modules/auth";
import { env } from "@/modules/config/server";
import type { Environment } from "@/modules/config";
import { envelopeOf, log, ok } from "@/modules/platform";
import { requestIdOf } from "../_lib/request-id";

export const dynamic = "force-dynamic";

const UNKNOWN_SHA = "unknown";
const OK_STATUS = 200;
/** ADR-130: not "the server erred" but "do not send traffic here yet" — what a readiness probe reads. */
const SERVICE_UNAVAILABLE = 503;

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
  const { body, headers } = envelopeOf(ok(report), { requestId });
  return Response.json(body, {
    status: db === "failed" ? SERVICE_UNAVAILABLE : OK_STATUS,
    headers,
  });
}
