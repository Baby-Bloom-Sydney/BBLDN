// The two refusals `runCron` can make, in one place so the log line and the envelope can never disagree.
// Both are errors, never a 200: a cron shell that answered "ok" would read to an operator as "the job ran".
import { err, log, toResponse } from "@/modules/platform";

type Refusal = "unauthorised" | "undeclared" | "no-handler";

const BODIES = {
  unauthorised: {
    code: "UNAUTHENTICATED",
    message: "Unauthorised",
    reason: "bad-cron-secret",
  },
  undeclared: {
    code: "INTERNAL",
    message: "Unknown job",
    reason: "undeclared",
  },
  "no-handler": {
    code: "INTERNAL",
    message: "No handler is registered for this job",
    reason: "no-handler-registered",
  },
} as const;

export function refuseCron(
  refusal: Refusal,
  requestId: string,
  path: string,
): Response {
  const body = BODIES[refusal];
  if (refusal === "undeclared")
    log.error("cron route is not declared in config/crons.ts", {
      requestId,
      action: "cron",
      path,
      alert: "ALERT_CRON_FAILED",
    });
  if (refusal === "unauthorised")
    log.warn("cron request rejected: bad or missing bearer", {
      requestId,
      action: "cron",
      path,
    });
  return toResponse(err(body.code, body.message, { reason: body.reason }), {
    requestId,
  });
}
