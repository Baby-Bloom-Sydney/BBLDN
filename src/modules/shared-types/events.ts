// 03 §9.3 — `EventName` (88 names, add-only; append never rename) and the client subset.
// Per-event props are the zod schemas `platform/events` owns (S3); `EventPropsMap` is the typed seam it fills.
export const EVENT_NAMES = Object.freeze([
  // Stage — position (8)
  "position.drafted",
  "position.created",
  "position.connecting",
  "position.reopened",
  "position.active",
  "position.ended",
  "position.closed",
  "position.amended",
  // Stage — pre-check (3)
  "precheck.fired",
  "precheck.failed",
  "precheck.responded",
  // Stage — call (4)
  "call.requested",
  "call.slot-chosen",
  "call.rescheduled",
  "call.done",
  // Stage — connection (9)
  "connection.requested",
  "connection.applied",
  "connection.accepted",
  "connection.declined",
  "connection.cancelled",
  "connection.expired",
  "connection.not-selected",
  "connection.finished",
  "connection.amended",
  // Stage — meeting / outcome (9)
  "meeting.scheduled",
  "meeting.rescheduled",
  "meeting.complete",
  "meeting.incomplete",
  "outcome.recorded",
  "trial.arranged",
  "trial.complete",
  "offer.made",
  "offer.withdrawn",
  // Stage — placement (4)
  "placement.confirmed",
  "placement.started",
  "placement.ended",
  "placement.amended",
  // Booking (5) — ADR-074
  "booking.held",
  "booking.displaced",
  "booking.displacement-failed",
  "booking.blocked-over",
  "availability.changed",
  // Funnel (8)
  "visit",
  "quick-match.run",
  "lead.created",
  "wizard.step",
  "wizard.completed",
  "results.viewed",
  "profile.viewed",
  "signup.completed",
  // Purchase (10)
  "bundle.link-sent",
  "deposit.paid",
  "deposit.refunded",
  "payment.due",
  "trial.started",
  "bundle.paid",
  "bundle.payment-failed",
  "access.opened",
  "access.toggled",
  "access.lapsed",
  // Usage (1)
  "usage.weekly-check",
  // App / invite (4)
  "invite.sent",
  "invite.claimed",
  "app.family-in",
  "app.nanny-in",
  // Verification (5)
  "verification.submitted",
  "verification.level-changed",
  "verification.held",
  "verification.released",
  "vetting.evidence-viewed",
  // Vetting (8)
  "vetting.submitted",
  "vetting.extracted",
  "vetting.checked",
  "vetting.needs-admin",
  "vetting.decision-recorded",
  "vetting.expiry-approaching",
  "vetting.expired",
  "vetting.provider-unavailable",
  // Nanny onboarding (2)
  "nanny.applied",
  "nanny.isolation-lifted",
  // Comms (4)
  "message.queued",
  "message.sent",
  "message.failed",
  "message.cancelled",
  // Platform (2)
  "consent.updated",
  "ui.click",
  // Retention (2)
  "account.deleted",
  "retention.applied",
] as const);

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Props per event (03 §9.3 "Props" column). `platform/events` (S3) narrows each entry to its zod-inferred
 * shape via declaration merging; until then every name maps to a readonly record. Props never carry PII —
 * ids only (03 §9.2 rule 3); the zod schema is the enforcement, this map is the type seam.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by platform/events (S3)
export interface EventPropsMap extends Record<
  EventName,
  Readonly<Record<string, unknown>>
> {}

export type PropsFor<N extends EventName> = EventPropsMap[N];
