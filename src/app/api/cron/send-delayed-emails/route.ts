// Cron shell for `/api/cron/send-delayed-emails` (01 §4e / §4f; ADR-161). Thin by rule: `runCron` is the one place
// the Bearer `CRON_SECRET` check lives, and this file supplies the inside — the four sweeps the 5-minute run hosts:
// `08.43` the call-due / overdue sweep (`admin/call-queue`), `expire-slot-holds` (`scheduling.expireHolds`, 03
// §3.5), the stale-`processing` sweep (I-V4) and the `08.11` reminder funnel (`verification`).
//
// RECORDED GAP (ADR-161): the DELIVERY of queued `email_logs` rows — `08.20` proper — is not here. `comms` has no
// template renderer (03 §8 "no template file"; Phase 4a `08.01`), so every send fails closed with
// `renderer-not-configured` and a delivery loop would only settle rows `failed`. Pinned `it.fails` in
// `send-delayed-emails.route.test.ts`; owner Phase 4a.
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
    if (!stale.ok) return stale;
    if (!reminders.ok) return reminders;
    return {
      ok: true,
      value: {
        handled:
          calls.overdue +
          calls.waiting +
          (holds.ok ? holds.value.expired : 0) +
          stale.value.handled +
          reminders.value.handled,
        skipped:
          stale.value.skipped + reminders.value.skipped + (holds.ok ? 0 : 1),
      },
    };
  });
}
