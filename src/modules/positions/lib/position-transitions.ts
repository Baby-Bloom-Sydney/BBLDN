// 03 §2.4 "Position" — the seven P rows as `TransitionSpec`s, the table the slice dispatches on. `from: [null]`
// = the row creates the position. This is the position third of the 44-row `TRANSITIONS` table 03 §2.5 declares;
// the C rows are `call-layer`'s (`CALL_TRANSITIONS`), the K and L rows are `connections`' and `placements`'
// (`1f` / `1g`). The table test that proves the whole 44 against §2.4 can only run once all four exist — pinned
// in `positions.table.test.ts`.
import type { TransitionSpec } from "@/modules/shared-types";

export const POSITION_TRANSITIONS: ReadonlyArray<TransitionSpec> =
  Object.freeze([
    {
      id: "P-1",
      entity: "position",
      from: [null],
      to: "DRAFT",
      movers: ["user:parent", "admin"],
      idempotency: "noop",
    },
    {
      id: "P-2",
      entity: "position",
      from: [null, "DRAFT"],
      to: "OPEN",
      movers: ["user:parent", "admin", "system"],
      systemJobs: ["signup-convert-lead"],
      idempotency: "noop",
    },
    {
      id: "P-3",
      entity: "position",
      from: ["OPEN"],
      to: "CONNECTING",
      movers: ["system", "admin"],
      systemJobs: ["cascade"],
      idempotency: "noop",
    },
    {
      id: "P-4",
      entity: "position",
      from: ["CONNECTING"],
      to: "OPEN",
      movers: ["system", "admin"],
      systemJobs: ["cascade"],
      idempotency: "noop",
    },
    {
      id: "P-5",
      entity: "position",
      from: ["CONNECTING"],
      to: "ACTIVE",
      movers: ["system"],
      systemJobs: ["cascade"],
      idempotency: "reject",
    },
    {
      id: "P-6",
      entity: "position",
      from: ["ACTIVE"],
      to: "ENDED",
      movers: ["user:parent", "user:nanny", "admin", "system"],
      systemJobs: ["cascade"],
      idempotency: "noop",
    },
    {
      id: "P-7",
      entity: "position",
      from: ["DRAFT", "OPEN", "CONNECTING"],
      to: "CLOSED",
      movers: ["user:parent", "admin", "system"],
      systemJobs: ["close-no-candidates"],
      idempotency: "noop",
    },
  ]);
