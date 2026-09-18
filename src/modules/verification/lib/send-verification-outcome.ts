// The outcome comms of 03 §8.2 rows 28–32, fired from a decision or the level-4 action (ADR-159), best effort:
// a send that fails is logged and never fails the decision it describes (01 §4a rule 2). One neutral sentence per
// outcome is the template's; this file hands it the nanny, the section and — for a rejection — the guidance key
// and nothing more (no reason enumeration reaches her beyond what 04 fixes). The admin's `admin-nanny-barred`
// goes to the config mailbox (`SENDERS.admin`, L4) and the operator's queue gets its row (ADR-160).
import { comms } from "@/modules/comms";
import { SENDERS, VETTING } from "@/modules/config/server";
import { log } from "@/modules/platform";
import type { Email, Instant, UserId, Uuid } from "@/modules/shared-types";
import { ENUMS } from "@/modules/shared-types";
import type {
  LevelSync,
  VerificationLevel,
  VerificationSection,
} from "../types";
import { REMINDER_KEYS } from "./reminder-keys";

const MINUTE_MS = 60_000;
const rank = (level: VerificationLevel): number =>
  ENUMS.verification_level.indexOf(level);
const POOL = rank("L3_PROVISIONALLY_VERIFIED");

const warn = (templateId: string, errorCode: string) =>
  log.warn("verification outcome message not sent", {
    module: "verification",
    action: "sendVerificationOutcome",
    templateId,
    errorCode: errorCode as never,
  });

/** Approved on entering the pool (L3) and again at L4 ("Fully verified"), once each; the reminders are cancelled. */
async function onLevelReached(nannyId: UserId, sync: LevelSync): Promise<void> {
  if (rank(sync.toLevel) <= rank(sync.fromLevel) || rank(sync.toLevel) < POOL)
    return;
  const sent = await comms.send({
    channel: "email",
    templateId: "verification-approved",
    to: { userId: nannyId as string as Uuid },
    data: { level: sync.toLevel },
    dedupeKey: REMINDER_KEYS.approved(nannyId, sync.toLevel),
  });
  if (!sent.ok) warn("verification-approved", sent.error.code);
  for (const step of VETTING.reminderOffsetsMinutes.keys()) {
    const cancelled = await comms.cancel(REMINDER_KEYS.reminder(nannyId, step));
    if (!cancelled.ok) warn("verification-reminder", cancelled.error.code);
  }
}

/** A rejection: `verification-action-needed` +10 min, keyed per section so a resubmission can cancel it. */
async function onRejected(
  nannyId: UserId,
  section: VerificationSection,
  guidanceKey: string,
  now: Instant,
): Promise<void> {
  const sendAt = new Date(
    Date.parse(now) + VETTING.actionNeededDelayMinutes * MINUTE_MS,
  ).toISOString() as Instant;
  const queued = await comms.schedule({
    channel: "email",
    templateId: "verification-action-needed",
    to: { userId: nannyId as string as Uuid },
    data: { section, guidanceKey },
    sendAt,
    dedupeKey: REMINDER_KEYS.actionNeeded(nannyId, section),
  });
  if (!queued.ok) warn("verification-action-needed", queued.error.code);
}

/** Barred (I-V5): her one sentence, the admin's alert, and the operator's queue row (ADR-160). */
async function onBarred(nannyId: UserId): Promise<void> {
  const hers = await comms.send({
    channel: "email",
    templateId: "verification-barred",
    to: { userId: nannyId as string as Uuid },
    data: {},
    dedupeKey: `verification-barred:${nannyId}`,
  });
  if (!hers.ok) warn("verification-barred", hers.error.code);
  const admin = await comms.send({
    channel: "email",
    templateId: "admin-nanny-barred",
    to: { email: SENDERS.admin.address as Email },
    data: { nannyId },
    dedupeKey: `admin-nanny-barred:${nannyId}`,
  });
  if (!admin.ok) warn("admin-nanny-barred", admin.error.code);
  const row = await comms.notifyAdmin({
    kind: "nanny_barred",
    subject: { type: "nanny", id: nannyId as string as Uuid },
    summary: "A DBS decision was adverse; the account is suspended.",
  });
  if (!row.ok) warn("admin_notifications:nanny_barred", row.error.code);
}

export async function sendVerificationOutcome(input: {
  readonly nannyId: UserId;
  readonly sync: LevelSync;
  readonly now: Instant;
  readonly rejected?: {
    readonly section: VerificationSection;
    readonly guidanceKey: string;
  };
}): Promise<void> {
  const { nannyId, sync } = input;
  if (sync.suspended) {
    await onBarred(nannyId);
    return;
  }
  if (input.rejected !== undefined)
    await onRejected(
      nannyId,
      input.rejected.section,
      input.rejected.guidanceKey,
      input.now,
    );
  await onLevelReached(nannyId, sync);
}
