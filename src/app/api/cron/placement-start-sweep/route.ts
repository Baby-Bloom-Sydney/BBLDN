// Cron shell for `/api/cron/placement-start-sweep` (01 §4e / §4f; A-22). Thin by rule: `runCron` is the one
// place the Bearer `CRON_SECRET` check lives, and this file supplies the inside — `placementsJobs.runStartSweep`,
// which finds the confirmed placements whose `start_date` has arrived in London and moves each through **L-1b**
// (`CONFIRMED → ACTIVE`), whose own cascade fires K-21 on the connection and opens done-for-you access.
//
// 00:15 London is 23:15Z the previous day through BST — the one hour of the day when the UTC date and the
// London date disagree, and the hour this job is scheduled for. The handler reads "today" from
// `platform.londonWallClock`, so nothing here needs to know that; `4b`'s due-gate has already picked the fire.
//
// Idempotent by construction: the sweep reads `CONFIRMED`, the state L-1b moves a row out of.
import { placementsJobs } from "@/modules/placements";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/placement-start-sweep";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) => placementsJobs.runStartSweep(now));
}
