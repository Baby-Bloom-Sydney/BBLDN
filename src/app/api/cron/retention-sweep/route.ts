// Cron shell for `/api/cron/retention-sweep` (01 §4e / §4f; 07 §6.2). Thin by rule: `runCron` is the one place
// the Bearer `CRON_SECRET` check lives, and this file supplies the inside — `privacy.sweepRetention`, the third
// of the three retention jobs `0000` names and the last of them to be built (L-009 `3h`; `3g`'s Q-1).
//
// **`handled` and `skipped` mean a third thing here, and the difference is worth the paragraph.** For
// `delete-account`, `skipped` is a person whose Art 17 request is still open — a backlog. For
// `purge-scrubbed-users`, `retained` is a person a retention window still holds — correct, and it only moves as
// dates arrive. Here `skipped` counts neither rows nor people but **classes**: the entries of 07 §6.2's schedule
// that no job acts on today, which are its ★ windows awaiting BAI's confirmation plus the two rows no database
// job could ever act on (the evidence log, the backups). It is a standing number that does not fall, and reading
// it as a queue would send an operator looking for a job that is not stuck.
//
// The two numbers that *should* move an operator are `failed` and `capped`, so they are logged under their own
// names: a class that raised will be retried tomorrow, and a class that hit its batch limit still has rows
// waiting — "500 removed, more to come" and "500 removed, that was all" are the same count of work done and
// completely different states.
import { log, privacy } from "@/modules/platform";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/retention-sweep";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, async (now) => {
    const run = await privacy.sweepRetention(now);
    if (!run.ok) return run;

    log.info("retention sweep", {
      action: "retention-sweep",
      handled: run.value.handled,
      classesNotActed: run.value.skipped,
      classesFailed: run.value.failed,
      classesCapped: run.value.capped,
    });

    return {
      ok: true,
      value: Object.freeze({
        handled: run.value.handled,
        skipped: run.value.skipped,
      }),
    };
  });
}
