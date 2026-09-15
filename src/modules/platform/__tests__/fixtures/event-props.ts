// One valid props fixture per EventName (03 §9.3 "Props" column; 05 §3 row 8 "every EventName props fixture
// parses"). Ids are uuids or opaque strings — never an email, name, phone or free text (03 §9.2 rule 3).
import { LOCALE } from "@/modules/config";
import type { EventName } from "@/modules/shared-types";

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID_2 = "00000000-0000-4000-8000-000000000002";
const AT = "2026-09-15T09:00:00+01:00";
const LATER = "2026-09-15T10:00:00+01:00";
const DAY = "2026-09-15";

const positionStage = {
  transition: "P-2",
  from: "DRAFT",
  to: "OPEN",
  source: "results_signup",
  areaDistrict: "SW4",
};
const connectionStage = {
  connectionId: UUID,
  nannyId: UUID_2,
  transition: "K-1",
  from: null,
  to: "REQUEST_SENT",
  origin: "self-serve",
};
const meeting = { connectionId: UUID, nannyId: UUID_2, meetingAt: AT };
const placement = {
  placementId: UUID,
  connectionId: UUID_2,
  nannyId: UUID,
  startDate: DAY,
  weeklyHours: 30,
};
const call = {
  positionId: UUID,
  bookingId: UUID_2,
  type: "matchmaking",
  slotAt: AT,
};
const purchase = { familyId: UUID, path: "payment-link" };
const verification = { nannyId: UUID, check: "dbs" };
const vetting = {
  submissionId: UUID,
  evidenceType: "dbs-certificate",
  provider: "stub-manual",
};
const message = {
  messageId: UUID,
  templateId: "call-confirmation",
  channel: "email",
  recipientUserId: UUID_2,
};

export const EVENT_PROPS_FIXTURES: Readonly<
  Record<EventName, Readonly<Record<string, unknown>>>
> = Object.freeze({
  "position.drafted": {
    ...positionStage,
    transition: "P-1",
    from: null,
    to: "DRAFT",
  },
  "position.created": positionStage,
  "position.connecting": {
    ...positionStage,
    transition: "P-3",
    from: "OPEN",
    to: "CONNECTING",
  },
  "position.reopened": {
    ...positionStage,
    transition: "P-4",
    from: "CONNECTING",
    to: "OPEN",
  },
  "position.active": {
    ...positionStage,
    transition: "P-5",
    from: "CONNECTING",
    to: "ACTIVE",
  },
  "position.ended": {
    ...positionStage,
    transition: "P-6",
    from: "ACTIVE",
    to: "ENDED",
    endReason: "natural",
    filledByNannyId: UUID_2,
  },
  "position.closed": {
    ...positionStage,
    transition: "P-7",
    from: "OPEN",
    to: "CLOSED",
    closeReason: "no_candidates",
  },
  "position.amended": { fields: ["schedule", "requirements"], version: 3 },
  "precheck.fired": {
    candidateCount: 12,
    rankedCount: 8,
    excludedByReason: { distance: 3, level: 1 },
    providerKind: "haversine",
  },
  "precheck.failed": { code: "PROVIDER_ERROR", requestId: "req-1" },
  "precheck.responded": { nannyId: UUID, available: true, slotsGiven: 2 },
  "call.requested": call,
  "call.slot-chosen": call,
  "call.rescheduled": {
    ...call,
    slotAt: null,
    reason: "no-answer",
    previousSlotAt: AT,
  },
  "call.done": { ...call, outcome: "proceeding" },
  "connection.requested": connectionStage,
  "connection.applied": {
    ...connectionStage,
    transition: "K-2",
    to: "NANNY_APPLIED",
    origin: "applied",
  },
  "connection.accepted": {
    ...connectionStage,
    transition: "K-3",
    from: "REQUEST_SENT",
    to: "ACCEPTED",
  },
  "connection.declined": {
    ...connectionStage,
    transition: "K-4",
    from: "REQUEST_SENT",
    to: "DECLINED",
  },
  "connection.cancelled": {
    ...connectionStage,
    transition: "K-5",
    from: "REQUEST_SENT",
    to: "REQUEST_CANCELLED",
  },
  "connection.expired": {
    ...connectionStage,
    transition: "K-6",
    from: "REQUEST_SENT",
    to: "REQUEST_EXPIRED",
  },
  "connection.not-selected": {
    ...connectionStage,
    transition: "K-7",
    from: "ACCEPTED",
    to: "NOT_SELECTED",
  },
  "connection.finished": {
    ...connectionStage,
    transition: "K-8",
    from: "ACCEPTED",
    to: "FINISHED",
  },
  "connection.amended": {
    connectionId: UUID,
    nannyId: UUID_2,
    fields: ["notes"],
    version: 2,
  },
  "meeting.scheduled": meeting,
  "meeting.rescheduled": meeting,
  "meeting.complete": { ...meeting, outcome: "awaiting" },
  "meeting.incomplete": { ...meeting, outcome: "incomplete" },
  "outcome.recorded": { ...meeting, outcome: "hired" },
  "trial.arranged": { ...meeting, trialDate: DAY },
  "trial.complete": { ...meeting, trialDate: DAY },
  "offer.made": { ...meeting, fillInitiatedBy: "parent" },
  "offer.withdrawn": { ...meeting, fillInitiatedBy: "admin" },
  "placement.confirmed": placement,
  "placement.started": placement,
  "placement.ended": { ...placement, endReason: "nanny_left" },
  "placement.amended": {
    placementId: UUID,
    connectionId: UUID_2,
    nannyId: UUID,
    fields: ["weeklyHours"],
    version: 2,
  },
  "booking.held": { bookingId: UUID, kind: "matchmaking", slotAt: AT },
  "booking.displaced": {
    bookingId: UUID,
    kind: "nanny-commission",
    slotAt: AT,
    from: AT,
    to: LATER,
    displacedBy: UUID_2,
  },
  "booking.displacement-failed": {
    bookingId: UUID,
    kind: "nanny-commission",
    from: AT,
    displacedBy: UUID_2,
  },
  "booking.blocked-over": {
    bookingId: UUID,
    kind: "onboarding",
    slotAt: AT,
    blockId: UUID_2,
  },
  "availability.changed": { ruleId: UUID, change: "created" },
  visit: { path: "/pricing" },
  "quick-match.run": { areaDistrict: "SW4", days: 3, matchCount: 7 },
  "lead.created": { leadId: UUID },
  "wizard.step": { leadId: UUID, step: 2, stepCount: 5 },
  "wizard.completed": { leadId: UUID, step: 5, stepCount: 5 },
  "results.viewed": { surface: "results", resultCount: 7, total: 12 },
  "profile.viewed": { nannyId: UUID },
  "signup.completed": { role: "parent", signupSource: "standard_match" },
  "bundle.link-sent": {
    ...purchase,
    linkKind: "deposit",
    preset: "deposit",
    depositMinor: 15000,
  },
  "deposit.paid": {
    ...purchase,
    amountMinor: 15000,
    currency: LOCALE.currency,
    providerEventId: "evt_1",
  },
  "deposit.refunded": {
    ...purchase,
    amountMinor: 15000,
    currency: LOCALE.currency,
    providerEventId: "evt_2",
  },
  "payment.due": { ...purchase, placementId: UUID_2, paymentDueAt: AT },
  "trial.started": { ...purchase, path: "self-serve", trialEndsAt: LATER },
  "bundle.paid": {
    ...purchase,
    shape: "upfront",
    amountMinor: 250000,
    currency: LOCALE.currency,
    providerEventId: "evt_3",
  },
  "bundle.payment-failed": { ...purchase, providerEventId: "evt_4" },
  "access.opened": {
    ...purchase,
    reason: "placed",
    placementId: UUID_2,
    satisfactionWindowEndsAt: LATER,
  },
  "access.toggled": {
    ...purchase,
    reason: "guarantee",
    on: true,
    until: LATER,
  },
  "access.lapsed": { ...purchase, reason: "trial-ended" },
  "usage.weekly-check": {
    familyId: UUID,
    childId: UUID_2,
    weekStart: DAY,
    postCount: 1,
    low: true,
  },
  "invite.sent": { inviteId: UUID, inviterRole: "parent", childCount: 2 },
  "invite.claimed": { inviteId: UUID, inviterRole: "parent", nannyId: UUID_2 },
  "app.family-in": { inviteId: UUID, inviterRole: "parent", childCount: 1 },
  "app.nanny-in": { nannyId: UUID },
  "verification.submitted": verification,
  "verification.level-changed": {
    ...verification,
    fromLevel: "L1_REGISTERED",
    toLevel: "L2_ID_VERIFIED",
  },
  "verification.held": { ...verification, holdReason: "silent-hold" },
  "verification.released": verification,
  "vetting.evidence-viewed": {
    submissionId: UUID,
    evidenceType: "identity-document",
    viewerAdminId: UUID_2,
  },
  "vetting.submitted": vetting,
  "vetting.extracted": vetting,
  "vetting.checked": { ...vetting, statusKind: "pass" },
  "vetting.needs-admin": { ...vetting, statusKind: "review" },
  "vetting.decision-recorded": { ...vetting, decision: "verified" },
  "vetting.expiry-approaching": { ...vetting, expiresAt: LATER },
  "vetting.expired": { ...vetting, expiresAt: AT },
  "vetting.provider-unavailable": vetting,
  "nanny.applied": { nannyId: UUID, path: "apply", areaDistrict: "N1" },
  "nanny.isolation-lifted": { nannyId: UUID, path: "apply-from-portal" },
  "message.queued": message,
  "message.sent": { ...message, providerMessageId: "stub-abc" },
  "message.failed": message,
  "message.cancelled": message,
  "consent.updated": { marketing: false, necessary: true },
  "ui.click": { surface: "pricing", target: "start-trial" },
  "account.deleted": {
    userId: UUID,
    scrubbedTables: ["user_profiles", "parents"],
    objectCount: 4,
  },
  "retention.applied": { retentionRow: "row-4", rowCount: 12, objectCount: 12 },
});
