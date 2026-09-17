// The five admin actions are a public HTTP surface (every `"use server"` export is). Two claims here: a
// malformed body gets a **typed** refusal rather than a thrown `TypeError`, and a well-formed one reaches the
// gated lever — never `scheduling` or `call-layer` directly.
//
// Authority itself is `admin-on-behalf`'s (`gate-admin-on-behalf.ts`, FIX-1 / REVIEW-1 C-1) and is pinned in
// that module's own gate suite; what this pins is that these actions **route through it**.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAdminOnBehalf } from "@/modules/admin-on-behalf";
import { configureAuth, stubAuth } from "@/modules/auth";
import {
  configureScheduling,
  createSchedulingStub,
} from "@/modules/scheduling";
import { ok } from "@/modules/platform";
import { configurePositions, stubPositions } from "@/modules/positions";
import type { Email, ParentId, PositionId } from "@/modules/shared-types";
import type { PositionMatchDetail } from "@/modules/positions";
import { recordCallOutcomeAction } from "../call-queue/actions/record-call-outcome-action";
import { moveCallSlotAction } from "../call-queue/actions/move-call-slot-action";
import { clearCallSlotAction } from "../call-queue/actions/clear-call-slot-action";
import { bookCallSlotAction } from "../call-queue/actions/book-call-slot-action";
import { blockRangeAction } from "../calendar/actions/block-range-action";
import { parsePartyRef } from "../call-queue/lib/parse-party-ref";

const lever = () => vi.fn(async () => ok({ kind: "call", state: {} }) as never);

let levers: Record<string, ReturnType<typeof lever>>;

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

/** The shape `PositionForMatching` needs; nothing in these specs reads it. */
const DETAIL: PositionMatchDetail = Object.freeze({
  area: { area: "Islington", district: "N1" },
  schedule: { type: "Fixed", blocks: [{ day: 0, part: "morning" }] } as const,
  requirements: {
    childAgeMonths: [{ min: 12, max: 24 }],
    capacity: 1,
    specialNeeds: false,
    licence: false,
    car: false,
    vaccination: false,
    nonSmoker: false,
    pets: false,
    roleType: "",
  },
});

/** 07 §5.4 rows 1–2: an admin session, and one that passed a second factor. Anything less and the gate refuses. */
const signedInAs = (role: "parent" | "admin", mfaVerified: boolean): void =>
  configureAuth(
    stubAuth({
      users: [
        {
          id: ADMIN_ID,
          email: "queue-test@example.test" as Email,
          password: "pw",
          role,
          mfaVerified,
        },
      ],
      signedInUserId: ADMIN_ID,
    }),
  );

beforeEach(() => {
  signedInAs("admin", true);
  levers = {
    recordOutcome: lever(),
    moveSlot: lever(),
    clearSlot: lever(),
    chooseSlot: lever(),
  };
  // `configureAdminOnBehalf` gates whatever it is given, so these doubles are reached only past the real gate;
  // the suite's session is not an admin, which is why the refusal below is the gate's and not this file's.
  configureAdminOnBehalf({
    advance: lever(),
    listAllowed: vi.fn(async () => []),
    bookNannyCall: lever(),
    autofire: lever(),
    ...levers,
  } as never);
  configureScheduling(createSchedulingStub());
  // ADR-145 (1): the action checks the position against the named parent before it books, so the suite needs a
  // `positions` connector that answers. `pos-1` belongs to `parent-1` here, which is what every green case uses.
  configurePositions(
    stubPositions({
      forMatching: {
        positionId: "pos-1" as PositionId,
        parentId: "parent-1" as ParentId,
        stage: "OPEN",
        district: "N1",
        activeConnectionNannyIds: [],
        detail: DETAIL,
      },
    }),
  );
});

const POSITION_REF = {
  kind: "position" as const,
  positionId: "pos-1",
  parentId: "parent-1",
};

describe("admin actions — the boundary refuses a malformed body with a type, not a throw", () => {
  it("refuses a missing or wrong-shaped ref on every action that takes one", async () => {
    const outcome = await recordCallOutcomeAction({} as never);
    const moved = await moveCallSlotAction({ slotId: "x" } as never);
    const cleared = await clearCallSlotAction({} as never);
    const booked = await bookCallSlotAction({ positionId: "p" } as never);
    for (const refused of [outcome, moved, cleared, booked]) {
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.code).toBe("VALIDATION");
    }
  });

  it("refuses an outcome that is not one of 03 §2.7's five, even though the type says it cannot happen", async () => {
    const refused = await recordCallOutcomeAction({
      ref: POSITION_REF,
      outcome: "sold",
    } as never);
    expect(!refused.ok && refused.error.code).toBe("VALIDATION");
    expect(levers.recordOutcome).not.toHaveBeenCalled();
  });

  it("refuses a block whose start is not before its end, and one with no reason", async () => {
    const backwards = await blockRangeAction({
      start: "2026-01-09T11:00:00.000Z",
      end: "2026-01-09T09:00:00.000Z",
      reason: "holiday",
    } as never);
    const blank = await blockRangeAction({
      start: "2026-01-09T09:00:00.000Z",
      end: "2026-01-09T11:00:00.000Z",
      reason: "   ",
    } as never);
    expect(!backwards.ok && backwards.error.code).toBe("VALIDATION");
    expect(!blank.ok && blank.error.code).toBe("VALIDATION");
  });

  it("parses only the two shapes `CallPartyRef` has, and nothing that merely looks like them", () => {
    expect(parsePartyRef(POSITION_REF)).toEqual(POSITION_REF);
    expect(parsePartyRef({ kind: "position", positionId: "p" })).toBeNull();
    expect(parsePartyRef({ kind: "family", id: "x" })).toBeNull();
    expect(parsePartyRef(null)).toBeNull();
    expect(parsePartyRef("pos-1")).toBeNull();
  });
});

describe("admin actions — every write goes through the gated lever, never around it", () => {
  it("reaches `adminOnBehalf`, carrying the party as `onBehalfOf`", async () => {
    await recordCallOutcomeAction({
      ref: POSITION_REF,
      outcome: "proceeding",
    } as never);
    expect(levers.recordOutcome).toHaveBeenCalledTimes(1);
    const actor = (
      levers.recordOutcome.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>
    )[0]?.[3] as {
      readonly kind: string;
      readonly id: string;
      readonly onBehalfOf?: { readonly role: string; readonly id: string };
    };
    expect(actor.kind).toBe("admin");
    expect(actor.onBehalfOf).toEqual({ role: "parent", id: "parent-1" });
    // The admin id downstream is the SESSION's, never the placeholder this panel wrote (FIX-1).
    expect(actor.id).not.toBe("session");
  });

  it("books on behalf with no hold, because 03 §3.2 says the admin never held one", async () => {
    await bookCallSlotAction({
      positionId: "pos-1",
      parentId: "parent-1",
      slotId: "default:2026-01-09T10:00:00.000Z",
    } as never);
    expect(levers.chooseSlot).toHaveBeenCalledTimes(1);
    expect(
      (
        levers.chooseSlot.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>
      )[0]?.[2],
    ).toBeUndefined();
  });

  it("clears with `admin-cancelled`, the only honest reason this screen can give", async () => {
    await clearCallSlotAction({
      positionId: "pos-1",
      parentId: "parent-1",
    } as never);
    expect(
      (
        levers.clearSlot.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>
      )[0]?.[2],
    ).toBe("admin-cancelled");
  });
});

describe("admin actions — authority is the session's, and the gate refuses first", () => {
  it("refuses a signed-in PARENT, and the lever's inside is never reached", async () => {
    signedInAs("parent", true);
    const refused = await recordCallOutcomeAction({
      ref: POSITION_REF,
      outcome: "proceeding",
    } as never);
    expect(refused.ok).toBe(false);
    expect(levers.recordOutcome).not.toHaveBeenCalled();
  });

  it("refuses an admin who has not passed a second factor (07 §5.4 row 2)", async () => {
    signedInAs("admin", false);
    const refused = await bookCallSlotAction({
      positionId: "pos-1",
      parentId: "parent-1",
      slotId: "default:2026-01-09T10:00:00.000Z",
    } as never);
    expect(refused.ok).toBe(false);
    expect(levers.chooseSlot).not.toHaveBeenCalled();
  });
});

// ── ADR-145 (1) — caller-supplied ownership is verified, never trusted ─────────────────────────────────────
//
// REVIEW-2 M-3: `onBehalfOf`'s **presence** was required and its **membership** never was. This action takes a
// caller-supplied `parentId` beside an independently caller-supplied `positionId` and passed both on with no
// check that the two belong together. That is not privilege escalation — the caller is already an MFA'd admin —
// but 07 §5.4 row 6 makes the audit subject the control, and a forgeable subject is not one.
describe("booking on behalf verifies the position belongs to the named parent (ADR-145)", () => {
  it("refuses E_SUBJECT_MISMATCH when the parent does not own the position, and never books", async () => {
    const refused = await bookCallSlotAction({
      positionId: "pos-1",
      parentId: "someone-else",
      slotId: "default:2026-01-09T10:00:00.000Z",
    } as never);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("FORBIDDEN");
      expect(refused.error.details?.reason).toBe("E_SUBJECT_MISMATCH");
    }
    expect(levers.chooseSlot).not.toHaveBeenCalled();
  });

  it("refuses rather than books when the position cannot be read at all", async () => {
    configurePositions(stubPositions({}));
    const refused = await bookCallSlotAction({
      positionId: "pos-1",
      parentId: "parent-1",
      slotId: "default:2026-01-09T10:00:00.000Z",
    } as never);
    expect(refused.ok).toBe(false);
    expect(levers.chooseSlot).not.toHaveBeenCalled();
  });

  // ADR-145's scope note, ruled as ADR-146 (3): `clear-call-slot-action` carries the same caller-supplied pair
  // as the booking action and had no membership check at all. Cancelling another family's call is a
  // **destructive** on-behalf move — the parent is sent `call-cancelled` (03 §3.5 seq 4) and the slot goes back
  // — so a forgeable audit subject matters here at least as much as it does on the booking road.
  it("clearing refuses E_SUBJECT_MISMATCH when the parent does not own the position, and never clears", async () => {
    const refused = await clearCallSlotAction({
      positionId: "pos-1",
      parentId: "someone-else",
    } as never);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("FORBIDDEN");
      expect(refused.error.details?.reason).toBe("E_SUBJECT_MISMATCH");
    }
    expect(levers.clearSlot).not.toHaveBeenCalled();
  });

  it("clearing refuses rather than clears when the position cannot be read at all", async () => {
    configurePositions(stubPositions({}));
    const refused = await clearCallSlotAction({
      positionId: "pos-1",
      parentId: "parent-1",
    } as never);
    expect(refused.ok).toBe(false);
    expect(levers.clearSlot).not.toHaveBeenCalled();
  });
});
