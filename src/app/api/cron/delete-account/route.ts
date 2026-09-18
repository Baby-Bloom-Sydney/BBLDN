// Cron shell for `/api/cron/delete-account` (01 §4e / §4f; 07 §6.1; B-46). Thin by rule: `runCron` is the one
// place the Bearer `CRON_SECRET` check lives, and this file supplies the inside — `privacy.sweepRequests`.
//
// It is a **re-attempt**, not the product path. Both roads run the erasure synchronously, so a request is
// normally closed before this cron sees it; what lands here is what the one transaction refused to commit — a
// DBS decision being recorded at that moment, which by design beats an erasure (`0027`). Declared since Phase 0;
// handler-less until L-009 `3f`.
import { privacy } from "@/modules/platform";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/delete-account";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) => privacy.sweepRequests(now));
}
