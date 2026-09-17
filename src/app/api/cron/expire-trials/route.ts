// Cron shell for `/api/cron/expire-trials` (01 §4e / §4f). Thin by rule: `runCron` is the one place the
// Bearer `CRON_SECRET` check lives, and this file supplies the inside.
//
// a self-serve family whose month with the app has run out → `lapsed{trial-ended}` and one `access.lapsed` (ADR-090 / 093). A done-for-you family is never here: it has no trial (ADR-093).
//
// Re-running is idempotent by construction: the job selects on the status it moves a row out of, so a second run
// in the same minute finds nothing (`sweep-targets.ts`).
import { paymentsJobs } from "@/modules/payments";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/expire-trials";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, async (now) => {
    const run = await paymentsJobs.run("expire-trials", now);
    return run.ok
      ? {
          ok: true,
          value: { handled: run.value.handled, skipped: run.value.skipped },
        }
      : run;
  });
}
