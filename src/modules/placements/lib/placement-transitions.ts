// 03 §2.4 "Placement" — the three L rows as `TransitionSpec`s. The last quarter of the 44-row `TRANSITIONS`
// table 03 §2.5 declares (7 P + 9 C + 25 K + 3 L).
//
// L-1b's id carries the `b`: 03 §2.4 numbers it that way because it is the *same* placement moving, not a
// fourth row, and `TRANSITION_IDS` keeps the literal.
import type { TransitionSpec } from "@/modules/shared-types";

export const PLACEMENT_TRANSITIONS: ReadonlyArray<TransitionSpec> =
  Object.freeze([
    {
      id: "L-1",
      entity: "placement",
      from: [null],
      to: "CONFIRMED",
      movers: ["system", "admin"],
      systemJobs: ["cascade"],
      idempotency: "reject",
    },
    {
      id: "L-1b",
      entity: "placement",
      from: ["CONFIRMED"],
      to: "ACTIVE",
      movers: ["system", "admin"],
      systemJobs: ["placement-start-sweep"],
      idempotency: "noop",
    },
    {
      id: "L-2",
      entity: "placement",
      from: ["CONFIRMED", "ACTIVE"],
      to: "ENDED",
      movers: ["user:parent", "user:nanny", "admin"],
      idempotency: "noop",
    },
  ]);
