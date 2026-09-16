// The unconfigured `admin-on-behalf` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B
// sweep).
//
// `admin-on-behalf.swap.test.ts`'s "fails closed" case installs a hand-written `AdminOnBehalf` whose methods
// return the `admin-on-behalf-not-configured` error and asserts it came back — it proves the fake, not
// `admin-on-behalf-registry.ts`. This file never calls `configureAdminOnBehalf`; vitest isolates module state
// per file, so every call below runs against the real factory default.
//
// This is the most important fail-closed default in the fan-out and it was the least tested: every lever here
// moves a real family's or nanny's stage.
//
// **Updated by FIX-1.** When REVIEW-1 wrote this file the admin gate did not exist, and this default was the
// only thing standing between the levers and a caller. The gate exists now — `auth.requireRole('admin')` with
// `mfaVerified` (07 §5.4 rows 1–2), applied to every lever by `configureAdminOnBehalf` and pinned by
// `admin-on-behalf.gate.test.ts`. The two are **independent layers and both still matter**: the gate answers
// "is this caller an admin", the default below answers "is there an inside at all". This file owns the second
// question, which is why it still never calls `configureAdminOnBehalf` — and why its assertions are unchanged.
import { describe, expect, it } from "vitest";
import { adminOnBehalf } from "@/modules/admin-on-behalf";
import type { Actor, PositionId } from "@/modules/shared-types";

const ADMIN: Actor = { kind: "admin", id: "admin-1" as never };
const POSITION = "position-1" as PositionId;
const ENTITY = { kind: "position", id: POSITION } as never;

describe("admin-on-behalf before any configureAdminOnBehalf call — the real registry default", () => {
  it("refuses advance rather than moving a stage on a family's behalf", async () => {
    const result = await adminOnBehalf.advance({
      entity: ENTITY,
      transition: "P-7",
      actor: ADMIN,
      payload: {},
      expectedFrom: null,
      idempotencyKey: "key-1",
    } as never);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "admin-on-behalf-not-configured",
    );
  });

  it("refuses every other lever — the slot moves, the outcome and the autofire", async () => {
    const results = await Promise.all([
      adminOnBehalf.chooseSlot(
        POSITION,
        "slot-1" as never,
        undefined,
        ADMIN,
        "key-2",
      ),
      adminOnBehalf.clearSlot(POSITION, ADMIN, "admin_cleared" as never),
      adminOnBehalf.autofire(POSITION, ADMIN),
    ]);

    for (const result of results) {
      expect(!result.ok && result.error.details?.reason).toBe(
        "admin-on-behalf-not-configured",
      );
    }
  });

  // 03 §2.5 gives `listAllowed` no `Result`, so unconfigured it answers "no levers". Pinned so it cannot
  // quietly start rendering admin levers that nothing is behind.
  it("offers no levers from listAllowed", async () => {
    expect(await adminOnBehalf.listAllowed(ENTITY, ADMIN)).toEqual([]);
  });
});
