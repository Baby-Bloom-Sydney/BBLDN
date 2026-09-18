// Cron shell for `/api/cron/vetting-expiry` (01 §4e / §4f; 03 §4.3; ADR-157 (4)). Thin by rule: `runCron` is the one
// place the Bearer `CRON_SECRET` check lives, and this file supplies the inside — `verification.sweepExpiry`:
// warn inside `VETTING.expiryLeadDays`, expire what has lapsed, the level recomputed by the sync.
import { verification } from "@/modules/verification";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/vetting-expiry";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) => verification.sweepExpiry(now));
}
