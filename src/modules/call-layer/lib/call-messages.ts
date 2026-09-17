// The messages the C rows name (03 §2.4 side effects; 03 §8.3): `call-confirmation` at C-1 with the reminders
// scheduled at `start − offset` for each `reminderOffsetsMinutes` (03 §3.2 — reminders are comms' schedule,
// not a scheduling job), `call-rescheduled` / `call-cancelled` at C-2 with the old reminders cancelled by
// `dedupeKey`. Comms fails closed until boot configures it; a failed message is logged with the code and the
// booked time stands — the slot is real whether or not the email went (01 §4a rule 2: never silent).
import { SCHEDULING } from "@/modules/config";
import type { Comms, TemplateId } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { Booking, ISO } from "@/modules/shared-types";
import type { CallMirror } from "../types";

const MINUTE_MS = 60_000;

type Kind = "confirmation" | "rescheduled" | "cancelled";

const TEMPLATE: Readonly<Record<Kind, TemplateId>> = Object.freeze({
  confirmation: "call-confirmation",
  rescheduled: "call-rescheduled",
  cancelled: "call-cancelled",
});

const reminderKey = (mirror: CallMirror, offset: number) =>
  `call-reminder:${mirror.positionId}:${offset}`;

const warn = (action: string, mirror: CallMirror, errorCode: string) =>
  log.warn("call message not sent", {
    module: "call-layer",
    action,
    errorCode: errorCode as never,
    positionId: mirror.positionId,
  });

async function scheduleReminders(
  comms: Comms,
  mirror: CallMirror,
  booking: Booking,
  now: ISO,
): Promise<void> {
  for (const offset of SCHEDULING.reminderOffsetsMinutes) {
    const sendAt = new Date(
      Date.parse(booking.start) - offset * MINUTE_MS,
    ).toISOString() as ISO;
    if (sendAt <= now) continue;
    const scheduled = await comms.schedule({
      channel: "email",
      templateId: "call-reminder",
      to: mirror.recipient,
      data: { type: mirror.type, slotAt: booking.start, offsetMinutes: offset },
      sendAt,
      dedupeKey: reminderKey(mirror, offset),
    });
    if (!scheduled.ok) warn("call-reminder", mirror, scheduled.error.code);
  }
}

async function cancelReminders(
  comms: Comms,
  mirror: CallMirror,
): Promise<void> {
  for (const offset of SCHEDULING.reminderOffsetsMinutes) {
    const cancelled = await comms.cancel(reminderKey(mirror, offset));
    if (!cancelled.ok) warn("cancel-reminder", mirror, cancelled.error.code);
  }
}

/** Send the message for a move; reschedule the reminders when a booking stands, cancel them when none does. */
export async function sendCallMessages(input: {
  readonly comms: Comms;
  readonly kind: Kind;
  readonly mirror: CallMirror;
  readonly booking: Booking | null;
  readonly now: ISO;
}): Promise<void> {
  const { comms, kind, mirror, booking, now } = input;
  const sent = await comms.send({
    channel: "email",
    templateId: TEMPLATE[kind],
    to: mirror.recipient,
    data: {
      type: mirror.type,
      slotAt: booking?.start ?? null,
      ...(mirror.aboutNanny === undefined
        ? {}
        : { aboutNanny: mirror.aboutNanny }),
    },
  });
  if (!sent.ok) warn(TEMPLATE[kind], mirror, sent.error.code);
  if (kind !== "confirmation") await cancelReminders(comms, mirror);
  if (booking !== null) await scheduleReminders(comms, mirror, booking, now);
}
