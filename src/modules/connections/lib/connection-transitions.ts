// 03 §2.4 "Connection" — the 25 K rows as `TransitionSpec`s, the table the slice dispatches on. `from: [null]`
// = the row creates the connection. This is the connection quarter of the 44-row `TRANSITIONS` table 03 §2.5
// declares; the P rows are `positions`' (`POSITION_TRANSITIONS`), the C rows `call-layer`'s
// (`CALL_TRANSITIONS`), the L rows `placements`' (`PLACEMENT_TRANSITIONS`).
//
// **There is no K-25.** 03 §2.4 goes K-1…K-24 then K-26, and `TRANSITION_IDS` carries the same gap; counting
// 25 rows is what the count line in §2.4 asks for, not counting to 26.
//
// "Any live" (K-22 / K-24 / K-26) is `LIVE_STAGES`, derived from the 02 §3 enum in its own file so the terminal
// list has one home.
import type { ConnectionStage, TransitionSpec } from "@/modules/shared-types";
import { LIVE_STAGES } from "./live-stages";

/** K-22 / K-24 "any live post-`ACCEPTED`" — a confirmed or active connection ends through L-2, never here. */
const CANCELLABLE: ReadonlyArray<ConnectionStage> = Object.freeze(
  LIVE_STAGES.filter((stage) => stage !== "CONFIRMED" && stage !== "ACTIVE"),
);

const OUTCOME_FROM: ReadonlyArray<ConnectionStage> = Object.freeze([
  "INTRO_COMPLETE",
  "AWAITING_RESPONSE",
  "TRIAL_COMPLETE",
]);

export const CONNECTION_TRANSITIONS: ReadonlyArray<TransitionSpec> =
  Object.freeze([
    {
      id: "K-1",
      entity: "connection",
      from: [null],
      to: "REQUEST_SENT",
      movers: ["user:parent", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-2",
      entity: "connection",
      from: [null],
      to: "ACCEPTED",
      movers: ["user:nanny", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-3",
      entity: "connection",
      from: [null],
      to: "NANNY_APPLIED",
      movers: ["user:nanny", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-4",
      entity: "connection",
      from: ["NANNY_APPLIED"],
      to: "ACCEPTED",
      movers: ["user:parent", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-5",
      entity: "connection",
      from: ["REQUEST_SENT"],
      to: "ACCEPTED",
      movers: ["user:nanny", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-6",
      entity: "connection",
      from: ["REQUEST_SENT", "NANNY_APPLIED"],
      to: "DECLINED",
      movers: ["user:nanny", "user:parent", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-7",
      entity: "connection",
      from: ["REQUEST_SENT"],
      to: "REQUEST_CANCELLED",
      movers: ["user:parent", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-8",
      entity: "connection",
      from: ["REQUEST_SENT", "NANNY_APPLIED"],
      to: "REQUEST_EXPIRED",
      movers: ["system", "admin"],
      systemJobs: ["expire-connections"],
      idempotency: "noop",
    },
    {
      id: "K-9",
      entity: "connection",
      from: ["ACCEPTED", "SCHEDULE_EXPIRED", "INTRO_INCOMPLETE"],
      to: "INTRO_SCHEDULED",
      movers: ["user:parent", "admin"],
      idempotency: "key",
    },
    {
      id: "K-10",
      entity: "connection",
      from: ["ACCEPTED"],
      to: "SCHEDULE_EXPIRED",
      movers: ["system", "admin"],
      systemJobs: ["expire-connections"],
      idempotency: "noop",
    },
    {
      id: "K-11",
      entity: "connection",
      from: ["INTRO_SCHEDULED"],
      to: "INTRO_SCHEDULED",
      movers: ["user:parent", "user:nanny", "admin"],
      idempotency: "key",
    },
    {
      id: "K-12",
      entity: "connection",
      from: ["INTRO_SCHEDULED"],
      to: "INTRO_COMPLETE",
      movers: ["system", "admin"],
      systemJobs: ["meeting-complete-sweep"],
      idempotency: "noop",
    },
    {
      id: "K-13",
      entity: "connection",
      from: ["INTRO_SCHEDULED", "INTRO_COMPLETE"],
      to: "INTRO_INCOMPLETE",
      movers: ["user:nanny", "user:parent", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-14",
      entity: "connection",
      from: ["INTRO_COMPLETE"],
      to: "AWAITING_RESPONSE",
      movers: ["user:nanny", "user:parent", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-15",
      entity: "connection",
      from: ["INTRO_COMPLETE", "AWAITING_RESPONSE"],
      to: "TRIAL_ARRANGED",
      movers: ["user:parent", "user:nanny", "admin"],
      idempotency: "key",
    },
    {
      id: "K-16",
      entity: "connection",
      from: ["TRIAL_ARRANGED"],
      to: "TRIAL_COMPLETE",
      movers: ["system", "user:nanny", "user:parent", "admin"],
      systemJobs: ["trial-complete-sweep"],
      idempotency: "noop",
    },
    {
      id: "K-17",
      entity: "connection",
      from: OUTCOME_FROM,
      to: "OFFERED",
      movers: ["user:parent", "user:nanny", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-18",
      entity: "connection",
      from: OUTCOME_FROM,
      to: "NOT_HIRED",
      movers: ["user:nanny", "user:parent", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-19",
      entity: "connection",
      from: ["OFFERED"],
      to: "AWAITING_RESPONSE",
      movers: ["user:parent", "user:nanny", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-20",
      entity: "connection",
      from: ["OFFERED"],
      to: "CONFIRMED",
      movers: ["user:parent", "user:nanny", "admin"],
      idempotency: "reject",
    },
    {
      id: "K-21",
      entity: "connection",
      from: ["CONFIRMED"],
      to: "ACTIVE",
      movers: ["system", "admin"],
      systemJobs: ["placement-start-sweep", "cascade"],
      idempotency: "noop",
    },
    {
      id: "K-22",
      entity: "connection",
      from: CANCELLABLE,
      to: "CANCELLED_BY_NANNY",
      movers: ["user:nanny", "admin"],
      idempotency: "noop",
    },
    {
      id: "K-23",
      entity: "connection",
      from: ["ACTIVE"],
      to: "FINISHED",
      movers: ["system"],
      systemJobs: ["cascade"],
      idempotency: "noop",
    },
    {
      id: "K-24",
      entity: "connection",
      from: CANCELLABLE,
      to: "CANCELLED_BY_PARENT",
      movers: ["user:parent", "admin", "system"],
      systemJobs: ["cascade"],
      idempotency: "noop",
    },
    {
      id: "K-26",
      entity: "connection",
      from: LIVE_STAGES,
      to: "NOT_SELECTED",
      movers: ["system", "admin"],
      systemJobs: ["cascade"],
      idempotency: "noop",
    },
  ]);
