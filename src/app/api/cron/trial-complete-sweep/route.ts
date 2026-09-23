// Cron shell for `/api/cron/trial-complete-sweep` (01 §4e / §4f; A-22). Thin by rule: `runCron` is the one place
// the Bearer `CRON_SECRET` check lives, and this file supplies the inside — `connectionsJobs.run`, which finds
// the trials dated before today in London and moves each through **K-16**
// (`TRIAL_ARRANGED → TRIAL_COMPLETE`).
//
// No timezone code here: `4b`'s due-gate delivers this at 04:00 London in both halves of the year, and the job
// derives "today" from `platform.londonWallClock` rather than from the UTC date — which differ every BST night.
//
// Idempotent by construction: the sweep selects on `TRIAL_ARRANGED`, the stage K-16 moves a row out of.
import { connectionsJobs } from "@/modules/connections";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/trial-complete-sweep";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) =>
    connectionsJobs.sweep("trial-complete-sweep", now),
  );
}
