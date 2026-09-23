// Cron shell for `/api/cron/close-no-candidates` (01 §4e / §4f; A-22). Thin by rule: `runCron` is the one place
// the Bearer `CRON_SECRET` check lives, and this file supplies the inside — `positionsJobs.runCloseNoCandidates`,
// which finds the positions whose pre-check window ended with no live connection and moves each through **P-7**
// (`→ CLOSED (no_candidates)`), whose own cascade fires K-24 on every live connection, closes the open call to
// C-4 and sends `no-candidates-left`.
//
// A position with **no pre-check lever** is never in the cohort: nobody has looked for her yet, and closing it
// would tell a family we found nobody when we never asked. That one is `dfy-waves`' to fire.
//
// Idempotent by construction: the cohort is read at OPEN / CONNECTING, the stages P-7 moves a row out of.
import { positionsJobs } from "@/modules/positions";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/close-no-candidates";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) =>
    positionsJobs.runCloseNoCandidates(now),
  );
}
