// Cron shell for `/api/cron/delete-account` (01 §4e / §4f). Thin by rule: it delegates to `runCron`, which is the one place the
// Bearer `CRON_SECRET` check lives — fail closed, constant-time, an unset secret rejecting every caller.
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/delete-account";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH);
}
