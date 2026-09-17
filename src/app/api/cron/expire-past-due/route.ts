// Cron shell for `/api/cron/expire-past-due` (01 §4e / §4f). Thin by rule: `runCron` is the one place the
// Bearer `CRON_SECRET` check lives, and this file supplies the inside.
//
// a family whose grace after a refused payment has run out → `lapsed{past-due}` (03 §5.4.5). The read side already treats a passed grace as lapsed, so this job makes the row agree with the gate rather than the gate wait for the job.
//
// Re-running is idempotent by construction: the job selects on the status it moves a row out of, so a second run
// in the same minute finds nothing (`sweep-targets.ts`).
import { paymentsJobs } from "@/modules/payments";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/expire-past-due";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, async (now) => {
    const run = await paymentsJobs.run("expire-past-due", now);
    return run.ok
      ? {
          ok: true,
          value: { handled: run.value.handled, skipped: run.value.skipped },
        }
      : run;
  });
}
