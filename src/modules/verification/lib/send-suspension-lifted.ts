// ★ ADR-168 (b)'s comms half: a lift is as notifiable as the bar was.
//
// Best effort, like every other outcome message on this module (01 §4a rule 2): a send that fails is logged and
// never fails the lift it describes — the lift is already durable in `nanny_suspension_lifts` and in the two
// `suspended_at` columns, and an email that did not leave is `comms`' own `email_logs` row to answer for.
//
// Two messages, matching `onBarred`'s pair exactly: one neutral sentence to her, and the admin mailbox
// (`SENDERS.admin`, L4). **No `admin_notifications` row** — ADR-160 rules that no new kind is added, and the
// operator's open `nanny_barred` row for this nanny is the one an operator acknowledges; opening a second row
// to say the first is answered is how a queue stops meaning anything.
import { comms } from "@/modules/comms";
import { SENDERS } from "@/modules/config/server";
import { log } from "@/modules/platform";
import type { Email, UserId, Uuid } from "@/modules/shared-types";

const warn = (templateId: string, errorCode: string) =>
  log.warn("suspension lift message not sent", {
    module: "verification",
    action: "sendSuspensionLifted",
    templateId,
    errorCode: errorCode as never,
  });

export async function sendSuspensionLifted(nannyId: UserId): Promise<void> {
  const hers = await comms.send({
    channel: "email",
    templateId: "verification-suspension-lifted",
    to: { userId: nannyId as string as Uuid },
    data: {},
    dedupeKey: `verification-suspension-lifted:${nannyId}`,
  });
  if (!hers.ok) warn("verification-suspension-lifted", hers.error.code);
  const admin = await comms.send({
    channel: "email",
    templateId: "admin-nanny-suspension-lifted",
    to: { email: SENDERS.admin.address as Email },
    data: { nannyId },
    dedupeKey: `admin-nanny-suspension-lifted:${nannyId}`,
  });
  if (!admin.ok) warn("admin-nanny-suspension-lifted", admin.error.code);
}
