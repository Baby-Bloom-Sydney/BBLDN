// Cron shell for `/api/cron/send-delayed-emails` (01 §4e / §4f; ADR-161). Thin by rule: `runCron` is the one place
// the Bearer `CRON_SECRET` check lives, and this file supplies the inside — the four sweeps the 5-minute run hosts:
// `08.43` the call-due / overdue sweep (`admin/call-queue`), `expire-slot-holds` (`scheduling.expireHolds`, 03
// §3.5), the stale-`processing` sweep (I-V4) and the `08.11` reminder funnel (`verification`).
//
// RECORDED GAP (ADR-161): the DELIVERY of queued `email_logs` rows — `08.20` proper — is still not here, but the
// reason has changed. 4a installed the provider and the template seam, so a send no longer fails closed on a
// missing renderer; what is absent is the loop itself (select `status = queued AND send_at <= now()`, render,
// deliver, settle, retry ≤ 3 with backoff — 03 §8.1 / §8.4). `comms` exposes no "deliver the due rows" method,
// and inventing one here would put the queue's business inside a route shell. Pinned `it.fails` in
// `_lib/__tests__/verification-crons.route.test.ts`; owner `08.20`.
import { callDueSweep } from "@/modules/admin";
import { SENDERS } from "@/modules/config/server";
import { scheduling } from "@/modules/scheduling";
import { verification } from "@/modules/verification";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/send-delayed-emails";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, async (now) => {
    const calls = await callDueSweep(
      { kind: "system", id: "admin-call-due" },
      now,
      { email: SENDERS.admin.address },
    );
    const holds = await scheduling.expireHolds(now);
    const stale = await verification.sweepStaleProcessing(now);
    const reminders = await verification.sweepReminders(now);
    // ★ REVIEW-4 H-1 — all three sweeps that can refuse fail the run the same way. `holds` used to be folded
    // into `skipped: +1` while its two siblings returned their error, so a scheduling outage stopped every slot
    // hold expiring behind an HTTP 200 and an `info` line — `run-cron.ts`'s `ALERT_CRON_FAILED` never fired,
    // and `skipped` was indistinguishable from a hold that simply was not due. All four still RUN before any
    // refusal is returned, so one sweep being down never costs the others their pass.
    if (!holds.ok) return holds;
    if (!stale.ok) return stale;
    if (!reminders.ok) return reminders;
    return {
      ok: true,
      value: {
        handled:
          calls.overdue +
          calls.waiting +
          holds.value.expired +
          stale.value.handled +
          reminders.value.handled,
        skipped: stale.value.skipped + reminders.value.skipped,
      },
    };
  });
}
