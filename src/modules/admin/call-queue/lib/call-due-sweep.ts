// `08.43` — the call-due / overdue sweep (03 §3.5 sequence 5: "the same cron pass hosts the admin **call-due /
// overdue sweep** owned by `admin/call-queue` (`admin-call-due`, `ALERT_CALL_OVERDUE`; 01 §4b)").
//
// **Two kinds of "due" and they are different facts.** A booked call becomes *overdue* when its start has
// passed by the config grace and nobody has recorded an outcome — `scheduling` already answers that, as the
// `due` field on a `CallListItem` (I-12, computed at read from `now`, never stored). A call with **no booking
// at all** is a different thing: nobody is late, the family is simply still waiting, and 03 §2.2 promises
// that we ring anyway. Both belong on this sweep, and the alert is only raised for the first — an alert
// that fires for every waiting family is an alert an admin learns to ignore.
//
// **Where this is, and where it is not.** 03 §3.5 puts the sweep here; 01 §4f puts its *schedule* in the
// `send-delayed-emails` cron pass, and that cron has no handler yet (`run-cron.ts` answers `no-handler` by
// design — a 200 that reads as "the job ran" is the one thing it refuses to be). So the sweep is written,
// tested and exported, and nothing calls it yet. That is a smaller gap than the one `1f` recorded — the logic
// existed nowhere — and it is named here rather than left for the next unit to rediscover.
import { SCHEDULING } from "@/modules/config";
import { callLayer } from "@/modules/call-layer";
import { comms } from "@/modules/comms";
import { log } from "@/modules/platform";
import { scheduling } from "@/modules/scheduling";
import type { Actor, ISO } from "@/modules/shared-types";
import type { CallDueSweepResult } from "../types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const LOOK_BACK_DAYS = 7;

export async function callDueSweep(
  actor: Actor,
  now: ISO,
  notify: { readonly email: string },
): Promise<CallDueSweepResult> {
  const at = Date.parse(now);
  const grace = SCHEDULING.overdueGraceMinutes * MINUTE_MS;

  const listed = await scheduling.listSchedule(
    {
      from: new Date(at - LOOK_BACK_DAYS * DAY_MS).toISOString() as ISO,
      to: now,
    },
    actor,
  );
  const overdue = listed.ok
    ? listed.value.filter(
        (item) =>
          item.due === "past" &&
          item.booking.outcome === undefined &&
          Date.parse(item.booking.start) + grace <= at,
      )
    : [];

  const open = await callLayer.listOpenCalls();
  const waiting = open.ok
    ? open.value.filter((call) => call.bookingId === null)
    : [];

  // 01 §4b: the alert names the count, never a family. No PII reaches an alert line.
  if (overdue.length > 0)
    log.error("ALERT_CALL_OVERDUE", {
      action: "cron",
      job: "admin-call-due",
      overdue: overdue.length,
      waiting: waiting.length,
    });

  if (overdue.length === 0 && waiting.length === 0)
    return { kind: "swept", overdue: 0, waiting: 0, notified: false };

  // One message to the admin, not one per call: 03 §8.3's `admin-call-due` is a nudge to open the queue, and a
  // queue is what the queue screen is for. `dedupeKey` is the day, so a 5-minute cron pass does not send 288.
  const sent = await comms.send({
    channel: "email",
    templateId: "admin-call-due",
    to: { email: notify.email as never },
    data: { overdue: overdue.length, waiting: waiting.length },
    dedupeKey: `admin-call-due:${now.slice(0, 10)}`,
  });

  return {
    kind: "swept",
    overdue: overdue.length,
    waiting: waiting.length,
    notified: sent.ok,
  };
}
