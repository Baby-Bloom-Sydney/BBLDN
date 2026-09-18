// The two messages 03 §2.7 names at `openNannyCall`: `call-confirmation` to the nanny and
// `admin-commission-booking` to the admin (04 §4.4 c3 "→ admin notification email (`08.18`) + her booking on
// the call list").
//
// **This closes `call-layer`'s recorded gap 3.** `1d` could not send either: "the module has no road to a
// nanny's email — the parent's recipient rides on the mirror, the nanny's has no home yet". ADR-136 is the
// road. A `Recipient` may be `{ userId }` and `comms` resolves it inside its own send (03 §8.1), so the
// address never exists in this module at all — which is stricter than the mirror's `{ email }` and is why no
// nanny recipient needs a home. The admin's address is not a user id, so boot hands it in (`adminEmail`,
// `SENDERS.admin` — never a literal, L4); with none configured the notice is logged and not invented.
//
// A failed message never fails the booking (01 §4a rule 2: the slot is real whether or not the email went),
// and it is never silent.
import type { Comms } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { Booking, Email, UserId, Uuid } from "@/modules/shared-types";

const warn = (templateId: string, bookingId: string, errorCode: string) =>
  log.warn("nanny call message not sent", {
    module: "call-layer",
    action: "openNannyCall",
    surface: "S-N-02",
    errorCode: errorCode as never,
    templateId,
    bookingId,
  });

export async function sendNannyCallMessages(input: {
  readonly comms: Comms;
  readonly nannyId: UserId;
  readonly booking: Booking;
  readonly adminEmail?: string;
}): Promise<void> {
  const { comms, nannyId, booking, adminEmail } = input;

  const confirmation = await comms.send({
    channel: "email",
    templateId: "call-confirmation",
    to: { userId: nannyId as string as Uuid },
    data: { type: "nanny-commission", slotAt: booking.start },
  });
  if (!confirmation.ok)
    warn("call-confirmation", booking.id as string, confirmation.error.code);

  if (adminEmail === undefined) {
    warn("admin-commission-booking", booking.id as string, "NO_ADMIN_ADDRESS");
    return;
  }
  const notice = await comms.send({
    channel: "email",
    templateId: "admin-commission-booking",
    to: { email: adminEmail as Email },
    data: { slotAt: booking.start, bookingId: booking.id as string },
  });
  if (!notice.ok)
    warn("admin-commission-booking", booking.id as string, notice.error.code);
  // ADR-160: the email is the delivery, the `admin_notifications` row the state (02 §4.6) — one writer, `comms`.
  const row = await comms.notifyAdmin({
    kind: "commission_call_booked",
    subject: { type: "booking", id: booking.id as string as Uuid },
    summary: "A nanny booked a commission call.",
    dueAt: booking.start,
  });
  if (!row.ok)
    warn(
      "admin_notifications:commission_call_booked",
      booking.id as string,
      row.error.code,
    );
}
