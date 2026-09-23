// Cron shell for `/api/cron/expire-connections` (01 §4e / §4f). Thin by rule: `runCron` is the one place the
// Bearer `CRON_SECRET` check lives, and this file supplies the inside — `connectionsJobs.run`, which finds the
// requests past their window and moves each through **K-8**, the row that already exists and is already tested.
//
// Idempotent by construction: the sweep selects on `REQUEST_SENT` / `NANNY_APPLIED`, the stages K-8 moves a row
// out of, so a second fire in the same minute finds nothing — and K-8 is `idempotency: 'noop'` besides.
//
// **K-10 (`ACCEPTED → SCHEDULE_EXPIRED`) is not swept** and the row has no anchor for it: `0007`'s `expires_at`
// is written by nothing, so the only date available is the *request* time and sweeping on it would expire a
// live accepted connection early. Pinned with its owner in
// `modules/connections/__tests__/connection-sweeps.test.ts`.
import { connectionsJobs } from "@/modules/connections";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/expire-connections";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) =>
    connectionsJobs.run("expire-connections", now),
  );
}
