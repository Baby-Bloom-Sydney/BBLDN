// ADR-158 (2) — the silent hold's connections arm: a connection made for a nanny below L4 is created
// `held_for_verification` (02 §4.2 row 7, R-14: "held rows withhold parent notification until L4"; 0007's parent
// SELECT policy already hides such a row). The RELEASE at L4 is built (`sync_nanny_verification_state()`, 0023)
// and proven in `int.rpc-0023`; the WRITE of the flag at K-row creation is this module's — `ConnectionRecord`
// carries no held pair and `upsert_connection()` (0019) inserts none, measured by `2c`. Pinned, not invented:
// the document wins. **Owner: `connections` (L-008 `2d`, or the next unit on the K rows).**
import { describe, expect, it } from "vitest";
import type { ConnectionRecord } from "../types";

describe("connections — the silent hold at creation (ADR-158 (2); R-14) — PINNED, owner 2d / connections", () => {
  it.fails(
    "a K-1 / K-2 / K-3 row for a nanny below L4 is created held_for_verification (the connections module writes the pair)",
    () => {
      // the record the module writes today: no `heldForVerification`, so the definer is never asked for it
      const record: ConnectionRecord = {
        connectionId: "c-1" as never,
        positionId: "p-1" as never,
        parentId: "pa-1" as never,
        nannyId: "n-1" as never,
        stage: "REQUEST_SENT",
        origin: "parent_request",
        createdAt: "2026-09-18T00:00:00.000Z" as never,
        version: 1,
      };
      expect("heldForVerification" in record).toBe(true);
    },
  );
});
