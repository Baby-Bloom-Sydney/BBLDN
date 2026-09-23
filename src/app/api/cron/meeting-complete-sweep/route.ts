// Cron shell for `/api/cron/meeting-complete-sweep` (01 §4e / §4f; A-22). Thin by rule: `runCron` is the one
// place the Bearer `CRON_SECRET` check lives, and this file supplies the inside — `connectionsJobs.run`, which
// finds the introductions whose `meeting_at` has passed and moves each through **K-12**
// (`INTRO_SCHEDULED → INTRO_COMPLETE`).
//
// Idempotent by construction: the sweep selects on `INTRO_SCHEDULED`, the stage K-12 moves a row out of. A row
// at that stage with no meeting time is K-9 unfinished, not a meeting that ran, and is left alone.
import { connectionsJobs } from "@/modules/connections";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/meeting-complete-sweep";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) =>
    connectionsJobs.sweep("meeting-complete-sweep", now),
  );
}
