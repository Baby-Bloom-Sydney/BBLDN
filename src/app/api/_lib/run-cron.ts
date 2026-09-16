// The one cron entry point (01 §4e, §4f). Every `/api/cron/*` route is four lines over this, so the auth rule
// lives in exactly one place and cannot drift back to the Sydney shape that skipped it.
//
// Fail closed, in order:
//   1. the route must be a **declared** cron (`config/crons.ts`), or Vercel is not calling it and it must not run;
//   2. Bearer `CRON_SECRET`, absent-secret-rejects, constant-time compare (`authorise-bearer.ts`);
//   3. one run-summary log line, every time (01 §4f);
//   4. no handler yet → an explicit error, never a 200 that reads as "the job ran".
import { env } from "@/modules/config/server";
import { log } from "@/modules/platform";
import { authoriseBearer } from "./authorise-bearer";
import { cronSpecFor } from "./cron-spec-for";
import { refuseCron } from "./refuse-cron";
import { requestIdOf } from "./request-id";

export async function runCron(
  request: Request,
  path: string,
): Promise<Response> {
  const requestId = requestIdOf(request);
  const spec = cronSpecFor(path);
  if (spec === undefined) return refuseCron("undeclared", requestId, path);

  const authorised = authoriseBearer(
    request.headers.get("authorization"),
    env.server.CRON_SECRET,
  );
  if (!authorised) return refuseCron("unauthorised", requestId, path);

  log.info("cron run", {
    requestId,
    action: "cron",
    path,
    job: spec.job ?? null,
    handled: 0,
  });
  return refuseCron("no-handler", requestId, path);
}
