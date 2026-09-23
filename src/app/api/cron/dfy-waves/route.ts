// Cron shell for `/api/cron/dfy-waves` (01 §4e / §4f; `08.25`). Thin by rule: `runCron` is the one place the
// Bearer `CRON_SECRET` check lives, and this file supplies the inside — `matching.sweepPrecheckWaves`, which
// re-fires the pre-check for every `OPEN` position with no lever.
//
// This is the net under `autofire`: 03 §7.4 is explicit that a blast failure must never fail the position
// write, so a position whose pre-check fell over sits `OPEN` and unlooked-at until this sweep picks it up.
//
// Idempotent by construction: `autofire` writes the lever, and the cohort is "OPEN with no lever", so a
// position this run fired is gone from the next run's.
//
// Wave 1 only — `MATCHING.precheck.waves` is 1 (@pending 01 §10 O-8). A second wave is `matching`'s to design,
// not a cron's; the pin is in `modules/matching/__tests__/precheck-waves-sweep.test.ts`.
import { sweepPrecheckWaves } from "@/modules/matching";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/dfy-waves";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) => sweepPrecheckWaves(now));
}
