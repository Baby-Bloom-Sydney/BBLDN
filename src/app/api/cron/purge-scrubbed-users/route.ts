// Cron shell for `/api/cron/purge-scrubbed-users` (01 §4e / §4f; 07 §6.1 step 6, second half). Thin by rule:
// `runCron` is the one place the Bearer `CRON_SECRET` check lives, and this file supplies the inside —
// `privacy.purgeScrubbedUsers`, the housekeeping half of the erasure path that `3f` named as its residual.
//
// **`handled` and `skipped` mean something different here, and the difference is the point.** For
// `delete-account`, `skipped` is a person whose Art 17 request is still open — a backlog an operator must clear.
// Here, `retained` is a person the database is still holding a row for **because a retention window says so**,
// which is a correct outcome that only changes when a date arrives. So it maps to `skipped` for the shared
// run-summary line, and the named breakdown below is what an operator should read instead: a `retained` count
// that does not fall is not a stuck queue.
import { log, privacy } from "@/modules/platform";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/purge-scrubbed-users";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, async (now) => {
    const run = await privacy.purgeScrubbedUsers(now);
    if (!run.ok) return run;

    log.info("purge sweep", {
      action: "purge-scrubbed-users",
      purged: run.value.purged,
      retained: run.value.retained,
    });

    return {
      ok: true,
      value: Object.freeze({
        handled: run.value.purged,
        skipped: run.value.retained,
      }),
    };
  });
}
