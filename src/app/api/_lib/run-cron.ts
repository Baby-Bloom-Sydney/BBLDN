// The one cron entry point (01 §4e, §4f). Every `/api/cron/*` route is four lines over this, so the auth rule
// lives in exactly one place and cannot drift back to the Sydney shape that skipped it.
//
// Fail closed, in order:
//   1. the route must be a **declared** cron (`config/crons.ts`), or Vercel is not calling it and it must not run;
//   2. Bearer `CRON_SECRET`, absent-secret-rejects, constant-time compare (`authorise-bearer.ts`);
//   3. one run-summary log line, every time (01 §4f);
//   4. no handler yet → an explicit error, never a 200 that reads as "the job ran".
import { env } from "@/modules/config/server";
import { err, log, toResponse } from "@/modules/platform";
import { authoriseBearer } from "./authorise-bearer";
import { cronSpecFor } from "./cron-spec-for";
import { requestIdOf } from "./request-id";

export async function runCron(
  request: Request,
  path: string,
): Promise<Response> {
  const requestId = requestIdOf(request);
  const spec = cronSpecFor(path);
  if (spec === undefined) {
    log.error("cron route is not declared in config/crons.ts", {
      requestId,
      action: "cron",
      path,
      alert: "ALERT_CRON_FAILED",
    });
    return toResponse(
      err("INTERNAL", "Unknown job", { reason: "undeclared" }),
      {
        requestId,
      },
    );
  }

  if (
    !authoriseBearer(
      request.headers.get("authorization"),
      env.server.CRON_SECRET,
    )
  ) {
    log.warn("cron request rejected: bad or missing bearer", {
      requestId,
      action: "cron",
      path,
      job: spec.job ?? null,
    });
    return toResponse(
      err("UNAUTHENTICATED", "Unauthorised", { reason: "bad-cron-secret" }),
      { requestId },
    );
  }

  log.info("cron run", {
    requestId,
    action: "cron",
    path,
    job: spec.job ?? null,
    handled: 0,
  });
  return toResponse(
    err("INTERNAL", "No handler is registered for this job", {
      reason: "no-handler-registered",
    }),
    { requestId },
  );
}
