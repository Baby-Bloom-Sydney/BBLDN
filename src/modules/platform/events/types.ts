// platform/events — the events connector's types, copied from 03 §9.2 (+ the ports the sinks run on: 03 §9.5
// "the event-log writer and ConsentReader are injected at boot so platform stays a leaf"). This file also
// narrows `EventPropsMap` by declaration merging (shared-types/events.ts) to the zod-inferred props per event.
import type { z } from "zod";
import type {
  Actor,
  EntityRef,
  EventId,
  EventName,
  ISODate,
  Instant,
  LeadId,
  PositionId,
  PropsFor,
  Result,
  UnitOfWork,
  VisitorId,
} from "@/modules/shared-types";
import type { ConsentReader } from "../consent/types";
import type { Log } from "../log/types";
import type { EVENT_SCHEMAS } from "./schemas";

// ── 03 §9.2 (verbatim, typed) ──

export type EventActor =
  | Actor
  | { readonly kind: "visitor"; readonly id: VisitorId }
  | { readonly kind: "anonymous" };

export type Subject =
  | EntityRef
  | {
      readonly kind:
        | "parent"
        | "nanny"
        | "lead"
        | "booking"
        | "invite"
        | "purchase"
        | "verification";
      readonly id: string;
    };

export type Attribution = {
  readonly src?: "std" | "adv";
  readonly lead?: LeadId;
  readonly utm?: {
    readonly source?: string;
    readonly medium?: string;
    readonly campaign?: string;
    readonly content?: string;
    readonly term?: string;
  };
  /** hostname only */
  readonly referrer?: string;
  readonly landingPath?: string;
  /** marketing consent only */
  readonly fbclid?: string;
};

type EnvelopeShape<N extends EventName> = {
  /** = Meta event_id for pixel / CAPI dedup */
  readonly id: EventId;
  readonly name: N;
  readonly ts: Instant;
  readonly source: "server" | "client";
  readonly actor: EventActor;
  readonly subject?: Subject;
  readonly positionId?: PositionId;
  readonly props: PropsFor<N>;
  readonly attribution?: Attribution;
  readonly requestId?: string;
  readonly idempotencyKey?: string;
};

/** Distributive over `N`: an unpinned `EventEnvelope` is a discriminated union on `name`, so `props` narrows with it. */
export type EventEnvelope<N extends EventName = EventName> = N extends EventName
  ? EnvelopeShape<N>
  : never;

export type EmitInput<N extends EventName = EventName> = N extends EventName
  ? Omit<EnvelopeShape<N>, "id" | "ts" | "source"> & { readonly ts?: Instant }
  : never;

export type EmitOptions = {
  readonly uow?: UnitOfWork;
  /** `track` → `POST /api/events` marks its emits `client`; module actions leave it `server`. */
  readonly source?: "server" | "client";
};

/** add-only (03 §9.2) */
export type SinkId = "event-log" | "console" | "vercel-analytics" | "meta";

export type Sink = {
  readonly id: SinkId;
  readonly handle: (e: EventEnvelope) => Promise<Result<void>>;
  readonly timeoutMs?: number;
};

export type Unsubscribe = () => void;

export type EventsQuery = {
  readonly names?: ReadonlyArray<EventName>;
  readonly positionId?: PositionId;
  readonly subject?: Subject;
  readonly from?: Instant;
  readonly to?: Instant;
  readonly limit?: number;
  readonly cursor?: string;
};

export type EventsPage = {
  readonly rows: ReadonlyArray<EventEnvelope>;
  readonly nextCursor?: string;
};

export type CountQuery = {
  readonly names: ReadonlyArray<EventName>;
  readonly from: Instant;
  readonly to: Instant;
  readonly groupBy?: "day" | "name";
};

export type CountRow = {
  readonly name: EventName;
  readonly day?: ISODate;
  readonly count: number;
};

/**
 * `details.reason`: `VALIDATION` — unknown name · props schema · a client emit of a server-only name (03 §9.2);
 * `INTERNAL` — the event-log write failed under `opts.uow` (`event-log`) or `emit` itself threw (`unexpected`).
 */
export type EmitErrorDetails = {
  readonly reason:
    | "unknown-name"
    | "props"
    | "server-only-name"
    | "event-log"
    | "unexpected";
  readonly issues?: ReadonlyArray<string>;
};

export type EventsConnector = {
  emit<N extends EventName>(
    input: EmitInput<N>,
    opts?: EmitOptions,
  ): Promise<Result<{ readonly id: EventId }, EmitErrorDetails>>;
  subscribe(
    names: EventName | ReadonlyArray<EventName> | "*",
    sink: Sink,
  ): Unsubscribe;
  listSinks(): ReadonlyArray<SinkId>;
  /** admin read helper */
  queryEvents(q: EventsQuery): Promise<Result<EventsPage>>;
  countByName(q: CountQuery): Promise<Result<ReadonlyArray<CountRow>>>;
};

// ── Ports + wiring (03 §9.5) ──

/**
 * The `events` table behind the `event-log` sink and the two admin read helpers (02 §4.6). Implemented by the
 * boot code over `auth`'s data port (service role — 07 §5.1 rule 5 named use); `memoryEventLogStore` is the stub.
 * `insert` under `opts.uow` writes inside the caller's unit of work and dedups on `(name, idempotencyKey)` + `id`.
 */
export type EventLogStore = {
  insert(
    envelope: EventEnvelope,
    opts?: { readonly uow?: UnitOfWork },
  ): Promise<Result<void>>;
  query(q: EventsQuery): Promise<Result<EventsPage>>;
  countByName(q: CountQuery): Promise<Result<ReadonlyArray<CountRow>>>;
};

/** A sink whose failure is a real error to the caller only when it runs inside `opts.uow` (03 §9.2 rule 1). */
export type EventsDeps = {
  readonly store: EventLogStore;
  readonly sinks?: ReadonlyArray<Sink>;
  readonly log: Log;
  readonly consent?: ConsentReader;
  readonly clock?: () => Instant;
  readonly newId?: () => EventId;
  /** default 2 000 ms — a post-commit sink slower than this is logged `ALERT_EVENT_SINK_FAILED` and abandoned */
  readonly defaultTimeoutMs?: number;
};

// ── The `meta` sink (03 §9.5; ADR-055) ──

/**
 * One Conversions API event. `event_id` is `EventEnvelope.id` — the shared id a browser-side pixel call must
 * repeat for Meta to count the conversion once rather than twice (03 §9.2: "`id` = Meta event_id for pixel /
 * CAPI dedup").
 *
 * `user_data` carries **hashed ids only**. There is no `em` / `ph` / `fn` field and there is not going to be
 * one: 03 §9.2 rule 3 keeps email, phone, names and free text out of `props`, so a sink reading `props` has
 * nothing of that kind to forward, and a sink reaching around `props` for it would be reaching for data the
 * visitor was never told travels.
 */
export type MetaEventPayload = {
  readonly event_name: string;
  /** Unix **seconds** (Meta's unit), floored from the envelope's instant. */
  readonly event_time: number;
  readonly event_id: EventId;
  readonly action_source: "website";
  readonly event_source_url: string;
  readonly user_data: {
    /** SHA-256 hex of our own user or visitor id — never the id itself. */
    readonly external_id?: string;
    /** `fb.1.<ms>.<fbclid>`, present only when `fbclid` survived the marketing-consent strip. */
    readonly fbc?: string;
  };
  readonly custom_data?: { readonly content_category: string };
};

/**
 * What the sink is handed at boot. The dataset id and token reach it as a built `endpoint` + `accessToken`
 * rather than as config reads, for the reason `platform` is a leaf (01 §2.4): the module must not import
 * `config/server`, and a sink that read its own secrets could not be constructed in a test without them.
 *
 * `fetch` is injectable for the same reason the store is: the suite proves what is sent by running the sink,
 * not by reading it (`ecc-lite` rule 2).
 */
export type MetaSinkDeps = {
  readonly endpoint: string;
  readonly accessToken: string;
  /** 07 §2.9 — the only gate. Asked before every send, and a failure to answer stops the send. */
  readonly consent: ConsentReader;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
};

/** `withTimeout` — how a post-commit sink's failure is classified (03 §9.2 rule 1). */
export type TimeoutDetails = {
  readonly reason: "timeout" | "INTERNAL";
  readonly timeoutMs?: number;
};
export type FanOutOutcome = { readonly id: SinkId; readonly ok: boolean };

export type MemorySink = Sink & {
  readonly envelopes: ReadonlyArray<EventEnvelope>;
  readonly reset: () => void;
};

/** Per-event zod schema (03 §9.3 "Props" column); `.strict()`, ids only, PII-shaped strings rejected. */
export type EventSchemas = typeof EVENT_SCHEMAS;
export type InferredProps<N extends EventName> = z.infer<EventSchemas[N]>;

// ── EventPropsMap augmentation (shared-types/events.ts asks platform/events to narrow each entry) ──
// Members are declared one per name (not `extends`) so each overrides the wide base entry; the events suite
// pins that this list equals `EVENT_NAMES`.
declare module "@/modules/shared-types/events" {
  interface EventPropsMap {
    "position.drafted": InferredProps<"position.drafted">;
    "position.created": InferredProps<"position.created">;
    "position.connecting": InferredProps<"position.connecting">;
    "position.reopened": InferredProps<"position.reopened">;
    "position.active": InferredProps<"position.active">;
    "position.ended": InferredProps<"position.ended">;
    "position.closed": InferredProps<"position.closed">;
    "position.amended": InferredProps<"position.amended">;
    "precheck.fired": InferredProps<"precheck.fired">;
    "precheck.failed": InferredProps<"precheck.failed">;
    "precheck.responded": InferredProps<"precheck.responded">;
    "call.requested": InferredProps<"call.requested">;
    "call.slot-chosen": InferredProps<"call.slot-chosen">;
    "call.rescheduled": InferredProps<"call.rescheduled">;
    "call.done": InferredProps<"call.done">;
    "connection.requested": InferredProps<"connection.requested">;
    "connection.applied": InferredProps<"connection.applied">;
    "connection.accepted": InferredProps<"connection.accepted">;
    "connection.declined": InferredProps<"connection.declined">;
    "connection.cancelled": InferredProps<"connection.cancelled">;
    "connection.expired": InferredProps<"connection.expired">;
    "connection.not-selected": InferredProps<"connection.not-selected">;
    "connection.finished": InferredProps<"connection.finished">;
    "connection.amended": InferredProps<"connection.amended">;
    "meeting.scheduled": InferredProps<"meeting.scheduled">;
    "meeting.rescheduled": InferredProps<"meeting.rescheduled">;
    "meeting.complete": InferredProps<"meeting.complete">;
    "meeting.incomplete": InferredProps<"meeting.incomplete">;
    "outcome.recorded": InferredProps<"outcome.recorded">;
    "trial.arranged": InferredProps<"trial.arranged">;
    "trial.complete": InferredProps<"trial.complete">;
    "offer.made": InferredProps<"offer.made">;
    "offer.withdrawn": InferredProps<"offer.withdrawn">;
    "placement.confirmed": InferredProps<"placement.confirmed">;
    "placement.started": InferredProps<"placement.started">;
    "placement.ended": InferredProps<"placement.ended">;
    "placement.amended": InferredProps<"placement.amended">;
    "booking.held": InferredProps<"booking.held">;
    "booking.displaced": InferredProps<"booking.displaced">;
    "booking.displacement-failed": InferredProps<"booking.displacement-failed">;
    "booking.blocked-over": InferredProps<"booking.blocked-over">;
    "availability.changed": InferredProps<"availability.changed">;
    visit: InferredProps<"visit">;
    "quick-match.run": InferredProps<"quick-match.run">;
    "lead.created": InferredProps<"lead.created">;
    "wizard.step": InferredProps<"wizard.step">;
    "wizard.completed": InferredProps<"wizard.completed">;
    "results.viewed": InferredProps<"results.viewed">;
    "profile.viewed": InferredProps<"profile.viewed">;
    "signup.completed": InferredProps<"signup.completed">;
    "bundle.link-sent": InferredProps<"bundle.link-sent">;
    "deposit.paid": InferredProps<"deposit.paid">;
    "deposit.refunded": InferredProps<"deposit.refunded">;
    "payment.due": InferredProps<"payment.due">;
    "trial.started": InferredProps<"trial.started">;
    "bundle.paid": InferredProps<"bundle.paid">;
    "bundle.payment-failed": InferredProps<"bundle.payment-failed">;
    "access.opened": InferredProps<"access.opened">;
    "access.toggled": InferredProps<"access.toggled">;
    "access.lapsed": InferredProps<"access.lapsed">;
    "usage.weekly-check": InferredProps<"usage.weekly-check">;
    "invite.sent": InferredProps<"invite.sent">;
    "invite.claimed": InferredProps<"invite.claimed">;
    "app.family-in": InferredProps<"app.family-in">;
    "app.nanny-in": InferredProps<"app.nanny-in">;
    "verification.submitted": InferredProps<"verification.submitted">;
    "verification.level-changed": InferredProps<"verification.level-changed">;
    "verification.held": InferredProps<"verification.held">;
    "verification.released": InferredProps<"verification.released">;
    "vetting.evidence-viewed": InferredProps<"vetting.evidence-viewed">;
    "vetting.submitted": InferredProps<"vetting.submitted">;
    "vetting.extracted": InferredProps<"vetting.extracted">;
    "vetting.checked": InferredProps<"vetting.checked">;
    "vetting.needs-admin": InferredProps<"vetting.needs-admin">;
    "vetting.decision-recorded": InferredProps<"vetting.decision-recorded">;
    "vetting.expiry-approaching": InferredProps<"vetting.expiry-approaching">;
    "vetting.expired": InferredProps<"vetting.expired">;
    "vetting.provider-unavailable": InferredProps<"vetting.provider-unavailable">;
    "nanny.applied": InferredProps<"nanny.applied">;
    "nanny.isolation-lifted": InferredProps<"nanny.isolation-lifted">;
    "message.queued": InferredProps<"message.queued">;
    "message.sent": InferredProps<"message.sent">;
    "message.failed": InferredProps<"message.failed">;
    "message.cancelled": InferredProps<"message.cancelled">;
    "consent.updated": InferredProps<"consent.updated">;
    "ui.click": InferredProps<"ui.click">;
    "account.deleted": InferredProps<"account.deleted">;
    "retention.applied": InferredProps<"retention.applied">;
  }
}
