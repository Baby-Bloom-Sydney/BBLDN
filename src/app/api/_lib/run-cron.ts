// The one cron entry point (01 §4e, §4f). Every `/api/cron/*` route is four lines over this, so the auth rule
// lives in exactly one place and cannot drift back to the Sydney shape that skipped it.
//
// Fail closed, in order:
//   1. the route must be a **declared** cron (`config/crons.ts`), or Vercel is not calling it and it must not run;
//   2. Bearer `CRON_SECRET`, absent-secret-rejects, constant-time compare (`authorise-bearer.ts`);
//   3. the fire must be **due in London** (`cron-is-due.ts`), or it is the other candidate UTC hour and does nothing;
//   4. one run-summary log line, every time (01 §4f);
//   5. no handler yet → an explicit error, never a 200 that reads as "the job ran".
//
// **Step 3 is where the timezone lives.** `vercel.json` schedules a declared London time at *both* candidate UTC
// hours, because no single UTC expression is 09:00 London through GMT and BST alike. Exactly one of the two is the
// declared London time on any given day; this is the one place the other is discarded, so every cron — the ones
// written today and the ones added later — fires twice in UTC and acts once per London day without its handler
// knowing anything about BST. A not-due fire is an ordinary, expected outcome that happens daily: it answers with
// a run summary of zero, not an error, and its log line carries `due: false` so an operator can tell the two
// apart at a glance.
//
// **The handler is passed in, not looked up** (`1h`). A registry here would make every cron shell import every
// module that owns a job, and the shells are the one place 05 §7 rule 5 says stays thin. A shell that has an
// inside hands it over; a shell that has none passes nothing and keeps answering `no-handler-registered`, which
// is what the 22 unhandled routes do today. The `CRON_SECRET` check still lives in exactly one place — here,
// before the handler is ever called.
//
// 07 §8 row 13: crons carry **no rate limit** by design — the Bearer secret is the control.
import { env } from "@/modules/config/server";
import { log, nowInstant, ok, toResponse } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import { authoriseBearer } from "./authorise-bearer";
import { cronIsDue } from "./cron-is-due";
import { cronSpecFor } from "./cron-spec-for";
import { refuseCron } from "./refuse-cron";
import { requestIdOf } from "./request-id";

/** What a job hands back for the run-summary line (01 §4f). `now` is passed so a test needs no clock. */
export type CronHandler = (
  now: ReturnType<typeof nowInstant>,
) => Promise<Result<{ readonly handled: number; readonly skipped: number }>>;

export async function runCron(
  request: Request,
  path: string,
  handler?: CronHandler,
): Promise<Response> {
  const requestId = requestIdOf(request);
  const spec = cronSpecFor(path);
  if (spec === undefined) return refuseCron("undeclared", requestId, path);

  const authorised = authoriseBearer(
    request.headers.get("authorization"),
    env.server.CRON_SECRET,
  );
  if (!authorised) return refuseCron("unauthorised", requestId, path);

  const now = nowInstant();
  if (!cronIsDue(spec.london, now)) {
    log.info("cron run", {
      requestId,
      action: "cron",
      path,
      job: spec.job ?? null,
      due: false,
      handled: 0,
      skipped: 0,
    });
    return toResponse(ok({ handled: 0, skipped: 0 }), { requestId });
  }

  if (handler === undefined) {
    log.info("cron run", {
      requestId,
      action: "cron",
      path,
      job: spec.job ?? null,
      due: true,
      handled: 0,
    });
    return refuseCron("no-handler", requestId, path);
  }

  const run = await handler(now);
  // The run summary is logged whatever happened, because "the sweep failed" is the line an operator needs most
  // and a thrown-away error is how a silent cron becomes a week of unswept rows (01 §4f).
  if (!run.ok) {
    log.error("cron run failed", {
      requestId,
      action: "cron",
      path,
      job: spec.job ?? null,
      due: true,
      alert: "ALERT_CRON_FAILED",
      errorCode: run.error.code,
    });
    return toResponse(run, { requestId });
  }
  log.info("cron run", {
    requestId,
    action: "cron",
    path,
    job: spec.job ?? null,
    due: true,
    handled: run.value.handled,
    skipped: run.value.skipped,
  });
  return toResponse(run, { requestId });
}
