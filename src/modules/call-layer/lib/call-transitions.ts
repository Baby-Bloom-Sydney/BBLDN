// 03 §2.4 "Call layer" — the C rows as `TransitionSpec`s, the table the slice dispatches on. C-d is a route
// redirect, not a transition (it has no from / to); C-e is deprecated to `openNannyCall` (§2.7). `from: [null]`
// = the row creates the mirror.
import type { TransitionSpec } from "@/modules/shared-types";

export const CALL_TRANSITIONS: ReadonlyArray<TransitionSpec> = Object.freeze([
  {
    id: "C-a",
    entity: "call",
    from: [null],
    to: "awaiting-slot",
    movers: ["system", "admin"],
    systemJobs: ["call-request", "signup-convert-lead", "cascade"],
    idempotency: "noop",
  },
  {
    id: "C-b",
    entity: "call",
    from: [null],
    to: "awaiting-slot",
    movers: ["system", "admin"],
    systemJobs: ["invite-claim"],
    idempotency: "noop",
  },
  {
    id: "C-c",
    entity: "call",
    from: [null, "done"],
    to: "awaiting-slot",
    movers: ["system", "admin"],
    systemJobs: ["cascade"],
    idempotency: "noop",
  },
  {
    id: "C-1",
    entity: "call",
    from: ["awaiting-slot"],
    to: "slot-chosen",
    movers: ["user:parent", "admin"],
    idempotency: "key",
  },
  {
    id: "C-2",
    entity: "call",
    from: ["slot-chosen"],
    to: "slot-chosen",
    movers: ["user:parent", "admin", "system"],
    systemJobs: ["scheduling"],
    idempotency: "key",
  },
  {
    id: "C-3",
    entity: "call",
    from: ["awaiting-slot", "slot-chosen"],
    to: "done",
    movers: ["admin"],
    idempotency: "reject",
  },
  {
    id: "C-4",
    entity: "call",
    from: ["awaiting-slot", "slot-chosen"],
    to: "done",
    movers: ["system", "admin"],
    systemJobs: ["cascade"],
    idempotency: "noop",
  },
  {
    id: "C-5",
    entity: "call",
    from: ["slot-chosen"],
    to: "awaiting-slot",
    movers: ["admin"],
    idempotency: "noop",
  },
]);
