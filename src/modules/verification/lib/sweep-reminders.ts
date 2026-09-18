// `08.11` — the reminder funnel (03 §8.2 row 32; ADR-161): for every nanny still below the pool with a section she
// can act on, LCY-1…4 are scheduled from her last section change at `VETTING.reminderOffsetsMinutes`, each under
// its own dedupe key, so a 5-minute pass is idempotent (comms answers the existing row) and the sync cancels the
// set the moment she reaches L3. An offset already behind us is skipped, never sent late.
import { comms } from "@/modules/comms";
import { VETTING } from "@/modules/config";
import { log, ok } from "@/modules/platform";
import type { Instant, Result, Uuid } from "@/modules/shared-types";
import type {
  SweepResult,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { REMINDER_KEYS } from "./reminder-keys";

const MINUTE_MS = 60_000;

export async function sweepReminders(
  deps: VerificationDeps,
  now: Instant,
): Promise<Result<SweepResult, VerificationErrorDetails>> {
  const stalled = await deps.store.listRemindable(
    "L3_PROVISIONALLY_VERIFIED",
  );
  if (!stalled.ok) return stalled;
  const at = Date.parse(now);
  let handled = 0;
  let skipped = 0;
  for (const nanny of stalled.value) {
    const from = Date.parse(nanny.lastChangeAt);
    for (const [step, offset] of VETTING.reminderOffsetsMinutes.entries()) {
      const sendAt = from + offset * MINUTE_MS;
      if (sendAt <= at) {
        skipped += 1;
        continue;
      }
      const queued = await comms.schedule({
        channel: "email",
        templateId: "verification-reminder",
        to: { userId: nanny.nannyId as string as Uuid },
        data: { step: step + 1 },
        sendAt: new Date(sendAt).toISOString() as Instant,
        dedupeKey: REMINDER_KEYS.reminder(nanny.nannyId, step),
      });
      if (queued.ok) handled += 1;
      else {
        skipped += 1;
        log.warn("verification reminder not scheduled", {
          module: "verification",
          action: "sweepReminders",
          step,
          errorCode: queued.error.code as never,
        });
      }
    }
  }
  return ok({ handled, skipped });
}
