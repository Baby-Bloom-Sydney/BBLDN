// What each K row writes: the next `ConnectionRecord` and the one `connection.*` / `meeting.*` / `trial.*` /
// `offer.*` / `outcome.*` event 03 §2.4 names for it (03 §9.3 owns the prop schemas, and an extra prop is a
// refused emit, not a dropped one — `1e` found that the hard way on `position.active`).
//
// The row's *preconditions* are the slice's (`create-connections-slice.ts`) and its *cascades* are
// `connection-cascades.ts`'. What lives here is the state change itself, so the 25 rows can be read as a table
// rather than as 25 functions.
import type {
  ConnectionStage,
  EventName,
  Instant,
  ISODate,
  TransitionId,
} from "@/modules/shared-types";
import type {
  ConnectionRecord,
  MeetingOutcome,
  PlacementTerms,
} from "../types";

/** The four event families of 03 §9.3, by the row that emits them (03 §2.4 "Side effects"). */
const EVENT_OF: Readonly<Record<string, EventName>> = Object.freeze({
  "K-1": "connection.requested",
  "K-2": "connection.accepted",
  "K-3": "connection.applied",
  "K-4": "connection.accepted",
  "K-5": "connection.accepted",
  "K-6": "connection.declined",
  "K-7": "connection.cancelled",
  "K-8": "connection.expired",
  "K-9": "meeting.scheduled",
  "K-10": "connection.expired",
  "K-11": "meeting.rescheduled",
  "K-12": "meeting.complete",
  "K-13": "meeting.incomplete",
  "K-14": "outcome.recorded",
  "K-15": "trial.arranged",
  "K-16": "trial.complete",
  "K-17": "offer.made",
  "K-18": "outcome.recorded",
  "K-19": "offer.withdrawn",
  "K-22": "connection.cancelled",
  "K-23": "connection.finished",
  "K-24": "connection.cancelled",
  "K-26": "connection.not-selected",
});

/**
 * K-20 and K-21 are **absent from the map on purpose**: 03 §2.4 gives neither an event of its own. K-20's facts
 * ride on its L-1 cascade (`placement.confirmed` — "emitted here, by the K-20 cascade, never by K-20"; fix:
 * A-28 / R9) and K-21's on L-1b's `placement.started` ("none — L-1b emits it"). Emitting a `connection.*` for
 * either would put a second name on one fact, which §9.4 exists to prevent — so `eventNameFor` answers
 * `undefined` and the slice emits nothing for those two rows.
 */
const eventNameFor = (id: TransitionId): EventName | undefined => EVENT_OF[id];

/** 03 §9.3's `connection.*` shape. `origin` is the contract's four-value union, not the DB enum. */
const CONNECTION_EVENTS: ReadonlySet<string> = new Set([
  "connection.requested",
  "connection.applied",
  "connection.accepted",
  "connection.declined",
  "connection.cancelled",
  "connection.expired",
  "connection.not-selected",
  "connection.finished",
]);

const originProp = (
  origin: ConnectionRecord["origin"],
): "self-serve" | "on-behalf" | "autofire" | "applied" => {
  if (origin === "nanny_application") return "applied";
  if (origin === "precheck_response") return "autofire";
  if (origin === "admin") return "on-behalf";
  return "self-serve";
};

function propsFor(
  id: TransitionId,
  name: EventName,
  next: ConnectionRecord,
  from: ConnectionStage | null,
): Readonly<Record<string, unknown>> {
  if (CONNECTION_EVENTS.has(name))
    return Object.freeze({
      connectionId: next.connectionId,
      nannyId: next.nannyId,
      transition: id,
      ...(from === null ? {} : { from }),
      to: next.stage,
      origin: originProp(next.origin),
    });
  // the meeting / outcome / trial / offer family (03 §9.3) — one shape, every field optional but the two ids
  return Object.freeze({
    connectionId: next.connectionId,
    nannyId: next.nannyId,
    ...(next.meetingAt === undefined ? {} : { meetingAt: next.meetingAt }),
    ...(next.meetingOutcome === undefined
      ? {}
      : { outcome: next.meetingOutcome }),
    ...(next.trialDate === undefined ? {} : { trialDate: next.trialDate }),
    ...(next.fillInitiatedBy === undefined
      ? {}
      : { fillInitiatedBy: next.fillInitiatedBy }),
  });
}

/** The columns a row sets on top of its stage move (02 §4.2 `connection_requests`). */
export type StepPayload = {
  readonly meetingAt?: Instant;
  readonly meetingSetBy?: ConnectionRecord["meetingSetBy"];
  readonly outcome?: MeetingOutcome;
  readonly trialDate?: ISODate;
  readonly fillInitiatedBy?: ConnectionRecord["fillInitiatedBy"];
  readonly availabilitySlots?: number;
  readonly terms?: PlacementTerms;
};

const MEETING_OUTCOME_OF: Readonly<Record<string, MeetingOutcome>> =
  Object.freeze({
    "K-12": "hired",
    "K-13": "incomplete",
    "K-14": "awaiting",
    "K-15": "trial",
    "K-18": "not_hired",
  });

/**
 * The next record. Immutably, always: `advance` is atomic per call, and a half-applied record handed to a
 * cascade that then fails is the one shape the stage model must never produce.
 */
function nextRecord(
  id: TransitionId,
  to: ConnectionStage,
  record: ConnectionRecord,
  payload: StepPayload,
): ConnectionRecord {
  const outcome =
    payload.outcome ??
    (id === "K-12" || id === "K-13" || id === "K-14" || id === "K-18"
      ? MEETING_OUTCOME_OF[id]
      : undefined);
  return Object.freeze({
    ...record,
    stage: to,
    version: record.version + 1,
    ...(payload.meetingAt === undefined
      ? {}
      : { meetingAt: payload.meetingAt }),
    ...(payload.meetingSetBy === undefined
      ? {}
      : { meetingSetBy: payload.meetingSetBy }),
    ...(outcome === undefined ? {} : { meetingOutcome: outcome }),
    ...(payload.trialDate === undefined
      ? {}
      : { trialDate: payload.trialDate }),
    ...(payload.fillInitiatedBy === undefined
      ? {}
      : { fillInitiatedBy: payload.fillInitiatedBy }),
    ...(payload.availabilitySlots === undefined
      ? {}
      : { availabilitySlots: payload.availabilitySlots }),
    ...(payload.terms === undefined ? {} : { terms: payload.terms }),
  });
}

export const CONNECTION_STEPS = Object.freeze({
  eventNameFor,
  propsFor,
  nextRecord,
});
