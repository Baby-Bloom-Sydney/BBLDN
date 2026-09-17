// Cron shell for `/api/cron/trial-reminders` (01 §4e / §4f). Thin by rule: `runCron` is the one place the
// Bearer `CRON_SECRET` check lives, and this file supplies the inside.
//
// T-5 — the operator's cue to call and the parent's plain note that her month is ending (03 §5.4.4). The stamp is written before the send is judged, so a provider outage cannot re-send tomorrow. There is no in-app countdown; the email is the only reminder.
//
// Re-running is idempotent by construction: the job selects on the status it moves a row out of, so a second run
// in the same minute finds nothing (`sweep-targets.ts`).
import { paymentsJobs } from "@/modules/payments";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/trial-reminders";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, async (now) => {
    const run = await paymentsJobs.run("trial-reminders", now);
    return run.ok
      ? {
          ok: true,
          value: { handled: run.value.handled, skipped: run.value.skipped },
        }
      : run;
  });
}
