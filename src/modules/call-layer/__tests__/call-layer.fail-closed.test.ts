// The unconfigured `call-layer` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// `call-layer.swap.test.ts`'s "fails closed" case installs a hand-written `CallLayer` whose methods return the
// `call-layer-not-configured` error and then asserts it came back — it proves the fake, not
// `call-layer-registry.ts`. This file never calls `configureCallLayer`; vitest isolates module state per file,
// so every call below runs against the real factory default.
//
// The registry's own comment is the claim under test: every method here either writes a booking or moves a
// stage, so a default that answered would tell a parent a call was booked when nothing was.
import { describe, expect, it } from "vitest";
import { callLayer } from "@/modules/call-layer";
import type { PositionId } from "@/modules/shared-types";

const POSITION = "position-1" as PositionId;
const RANGE = {
  from: "2026-01-01T00:00:00+00:00",
  to: "2026-01-08T00:00:00+00:00",
} as never;

describe("call-layer before any configureCallLayer call — the real registry default", () => {
  it("refuses listSlots rather than answering 'no slots' from a calendar it cannot read", async () => {
    const result = await callLayer.listSlots("matchmaking", RANGE);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "call-layer-not-configured",
    );
  });

  it("refuses every slot move and the outcome record, not only the read", async () => {
    const results = await Promise.all([
      callLayer.chooseSlot(
        POSITION,
        "slot-1" as never,
        undefined,
        { kind: "admin", id: "admin-1" as never },
        "key-1",
      ),
      callLayer.clearSlot(
        POSITION,
        { kind: "admin", id: "admin-1" as never },
        "admin_cleared" as never,
      ),
      callLayer.getCallState({ kind: "call", positionId: POSITION }),
    ]);

    for (const result of results) {
      expect(!result.ok && result.error.details?.reason).toBe(
        "call-layer-not-configured",
      );
    }
  });
});
