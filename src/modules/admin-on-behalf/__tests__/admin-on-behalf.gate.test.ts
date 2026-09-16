// FIX-1 — the admin authority gate (REVIEW-1 finding C-1, `docs/review-sweep-160926.md` §2).
//
// **Written RED, against the shipped code.** Before the fix every case below passed straight through: the only
// gate `adminOnBehalfLever` had was `actor.kind === 'admin'` on the `Actor` the **caller hands in**, so anyone
// able to shape an object was an admin, an `aal1` admin session was indistinguishable from an `aal2` one, and
// `onBehalfOf` — the audit field 07 §5.4 row 6 and 03 §2.5 require on every on-behalf write — was optional and
// populated nowhere.
//
// What this file pins, in the order the gate applies it (07 §5.4 rows 1–2, 6):
//   1. authority is **session-derived**: `auth.requireRole('admin')`, which also refuses an admin without
//      `mfaVerified` (`aal2`). Not a locally-invented check — `auth` owns the gate (01 §4d).
//   2. the caller-supplied `Actor` is **never** the source of authority: the admin id forwarded downstream is
//      the session's, not the one the caller wrote.
//   3. `onBehalfOf` is **required**: an on-behalf move with no named subject is refused before it moves.
//   4. the seam itself carries the gate — `configureAdminOnBehalf` cannot install an ungated inside (ADR-120:
//      the claim that protects this module is executable, not a comment).
import { beforeEach, describe, expect, it } from "vitest";
import {
  adminOnBehalf,
  configureAdminOnBehalf,
  stubAdminOnBehalf,
} from "@/modules/admin-on-behalf";
import { configureAuth, stubAuth } from "@/modules/auth";
import { configureCallLayer, stubCallLayer } from "@/modules/call-layer";
import { configureMatching } from "@/modules/matching";
import {
  configurePositions,
  registerSlice,
  stubPositions,
} from "@/modules/positions";
import {
  configureUnitOfWork,
  createUnitOfWork,
  memoryTransactionOpener,
  ok,
} from "@/modules/platform";
import type {
  Actor,
  AdminId,
  Email,
  Instant,
  PositionId,
  SlotId,
  StateAfter,
  UserId,
} from "@/modules/shared-types";
import type { AdminOnBehalf } from "@/modules/admin-on-behalf";

const SESSION_ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "position-1" as PositionId;
const AT = "2026-01-01T00:00:00+00:00" as Instant;

/** Who the admin is acting for — 03 §2.5's `onBehalfOf`, recorded on the event (02 `events.on_behalf_of_id`). */
const ON_BEHALF_OF = Object.freeze({
  role: "parent" as const,
  id: "99999999-9999-4999-8999-999999999999" as UserId,
});

/** The actor a caller writes. Its `id` is deliberately **not** the session's — nothing may trust it. */
const CALLER_ADMIN: Actor = Object.freeze({
  kind: "admin",
  id: "caller-written-admin" as AdminId,
  onBehalfOf: ON_BEHALF_OF,
});

const CALLER_ADMIN_NO_SUBJECT: Actor = Object.freeze({
  kind: "admin",
  id: "caller-written-admin" as AdminId,
});

const CALLER_PARENT: Actor = Object.freeze({
  kind: "user",
  id: "99999999-9999-4999-8999-999999999999" as UserId,
  role: "parent",
});

const signedInAs = (role: "parent" | "admin", mfaVerified: boolean): void =>
  configureAuth(
    stubAuth({
      users: [
        {
          id: SESSION_ADMIN_ID,
          email: "gate-test@example.test" as Email,
          password: "pw",
          role,
          mfaVerified,
        },
      ],
      signedInUserId: SESSION_ADMIN_ID,
    }),
  );

const advanceAs = (actor: Actor) =>
  adminOnBehalf.advance({
    entity: { kind: "position", id: POSITION_ID },
    transition: "P-7",
    actor,
    payload: {},
    expectedFrom: "OPEN",
    idempotencyKey: "key-p7",
  });

// The spy the whole file turns on: **which actor actually reached the stage handler**. One reassigned cell, not
// a mutated object — nothing here is domain state.
let seenActor: Actor | null = null;

beforeEach(() => {
  seenActor = null;
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configurePositions(stubPositions({ allowed: ["P-7", "K-24"], stages: {} }));
  configureCallLayer(
    stubCallLayer({
      calls: { [POSITION_ID]: { state: "awaiting-slot", type: "matchmaking" } },
    }),
  );
  // `admin-on-behalf` may not import `scoring` (01 §2.3), so the matching double is hand-written rather than
  // built from `stubMatching`, which would pull `scoring` in through this file's own imports. Every method
  // answers a typed refusal: no case here reaches `matching` — the gate refuses first, which is the point — so
  // a fabricated success would be a shape nothing asserts (typescript-reviewer, MEDIUM: no `as never`).
  configureMatching({
    autofire: async () => MATCHING_UNAVAILABLE,
    quickMatch: async () => MATCHING_UNAVAILABLE,
    preAuthMatch: async () => MATCHING_UNAVAILABLE,
    resultsFor: async () => MATCHING_UNAVAILABLE,

    listPublicNannies: async () => MATCHING_UNAVAILABLE,
    getPublicNanny: async () => MATCHING_UNAVAILABLE,
    saveLead: async () => MATCHING_UNAVAILABLE,
    getLead: async () => MATCHING_UNAVAILABLE,
    connect: async () => MATCHING_UNAVAILABLE,
  });
  registerSlice({
    entity: "position",
    handlers: [
      {
        id: "P-7",
        run: async (input) => {
          seenActor = input.actor;
          return ok({
            entity: input.entity,
            stage: "CLOSED" as const,
            version: 2,
            changedAt: AT,
            cascaded: [],
            events: [],
          });
        },
      },
    ],
  });
  // Anonymous by default: no session until a case signs one in.
  configureAuth(stubAuth());
  configureAdminOnBehalf(stubAdminOnBehalf());
});

describe("authority comes from the session, never from the Actor the caller shaped", () => {
  // `auth`'s own code is kept rather than collapsed to one refusal, so an admin whose session expired
  // mid-action is routed to sign-in instead of being told they lack access they in fact have.
  it("refuses an admin-shaped actor when no one is signed in", async () => {
    const result = await advanceAs(CALLER_ADMIN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("UNAUTHENTICATED");
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
    expect(!result.ok && result.error.details?.which).toBe("session");
    expect(seenActor).toBeNull();
  });

  it("refuses an admin-shaped actor when the session is a parent", async () => {
    signedInAs("parent", true);

    const result = await advanceAs(CALLER_ADMIN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.which).toBe("role");
    expect(seenActor).toBeNull();
  });

  it("refuses an admin session that never passed a second factor (07 §5.4 row 2)", async () => {
    signedInAs("admin", false);

    const result = await advanceAs(CALLER_ADMIN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("FORBIDDEN");
    expect(!result.ok && result.error.details?.which).toBe("mfa");
    expect(seenActor).toBeNull();
  });

  it("forwards the session's admin id, not the one the caller wrote", async () => {
    signedInAs("admin", true);

    const result = await advanceAs(CALLER_ADMIN);

    expect(result.ok).toBe(true);
    expect(seenActor).toEqual({
      kind: "admin",
      id: SESSION_ADMIN_ID,
      onBehalfOf: ON_BEHALF_OF,
    });
  });
});

describe("a failed session read is not a verdict about the caller", () => {
  // `auth` keeps "no session" and "we could not tell" apart on purpose (`get-session.ts`). The gate must keep
  // them apart too: relabelling a provider outage as a routine access refusal would bury the outage in exactly
  // the logs an incident is diagnosed from. Raised by `code-reviewer` at the FIX-1 inline review (HIGH).
  const PROVIDER_DOWN = "Could not read the session.";

  const sessionReadFails = (): void =>
    configureAuth({
      ...stubAuth(),
      requireRole: async () => ({
        ok: false as const,
        error: {
          code: "INTERNAL" as const,
          message: PROVIDER_DOWN,
          cause: new Error("identity provider unavailable"),
        },
      }),
    });

  it("forwards the read failure with its own message and cause, and still runs nothing", async () => {
    sessionReadFails();

    const result = await advanceAs(CALLER_ADMIN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.message).toBe(PROVIDER_DOWN);
    expect(!result.ok && result.error.cause).toBeInstanceOf(Error);
    // Not relabelled as an access refusal — that is the whole point of the case.
    expect(!result.ok && result.error.details?.reason).toBeUndefined();
    expect(seenActor).toBeNull();
  });

  it("offers no levers when the session cannot be read", async () => {
    sessionReadFails();

    await expect(
      adminOnBehalf.listAllowed(
        { kind: "position", id: POSITION_ID },
        CALLER_ADMIN,
      ),
    ).resolves.toEqual([]);
  });
});

describe("onBehalfOf is required on every on-behalf move (07 §5.4 row 6)", () => {
  it("refuses an admin move that names no subject", async () => {
    signedInAs("admin", true);

    const result = await advanceAs(CALLER_ADMIN_NO_SUBJECT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_ON_BEHALF_OF_REQUIRED",
    );
    expect(seenActor).toBeNull();
  });

  it("refuses a customer-shaped actor, which can carry no subject at all", async () => {
    signedInAs("admin", true);

    const result = await advanceAs(CALLER_PARENT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_ON_BEHALF_OF_REQUIRED",
    );
    expect(seenActor).toBeNull();
  });
});

describe("every lever is gated, not only advance", () => {
  it("refuses the call levers and the autofire without an MFA-verified admin session", async () => {
    signedInAs("admin", false);

    const results = await Promise.all([
      adminOnBehalf.chooseSlot(
        POSITION_ID,
        "slot-1" as SlotId,
        undefined,
        CALLER_ADMIN,
        "key-2",
      ),
      adminOnBehalf.moveSlot(
        { kind: "call", positionId: POSITION_ID },
        "slot-1" as SlotId,
        CALLER_ADMIN,
      ),
      adminOnBehalf.clearSlot(POSITION_ID, CALLER_ADMIN, "position-closed"),
      adminOnBehalf.recordOutcome(
        { kind: "call", positionId: POSITION_ID },
        "proceeding",
        undefined,
        CALLER_ADMIN,
      ),
      adminOnBehalf.bookNannyCall({
        nannyId: "nanny-1" as UserId,
        slotId: "slot-1" as SlotId,
        actor: CALLER_ADMIN,
        idempotencyKey: "key-3",
      }),
      adminOnBehalf.autofire(POSITION_ID, CALLER_ADMIN),
    ]);

    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("FORBIDDEN");
    }
  });

  // 03 §2.5 gives `listAllowed` no `Result`, so its refusal is "no levers" rather than an error.
  it("renders no levers for a session that is not an MFA-verified admin", async () => {
    signedInAs("admin", false);

    await expect(
      adminOnBehalf.listAllowed(
        { kind: "position", id: POSITION_ID },
        CALLER_ADMIN,
      ),
    ).resolves.toEqual([]);
  });

  it("renders the levers positions allows once the session is a real admin", async () => {
    signedInAs("admin", true);

    await expect(
      adminOnBehalf.listAllowed(
        { kind: "position", id: POSITION_ID },
        CALLER_ADMIN,
      ),
    ).resolves.toEqual(["P-7", "K-24"]);
  });
});

describe("the seam carries the gate — an ungated inside cannot be configured (ADR-120)", () => {
  // The exact line REVIEW-1 said would grant full on-behalf power to anyone who can shape an `Actor`: a
  // hand-written `AdminOnBehalf` that answers `ok` for everything, installed through the public boot hook.
  // After the fix the hook wraps whatever it is handed, so the open inside is unreachable without a session.
  // Typed as `AdminOnBehalf` and built from the real domain shapes, so a field added to `StateAfter` or
  // `CallResult` breaks this fixture instead of sliding past it (typescript-reviewer, MEDIUM). `bookNannyCall`
  // answers a typed refusal rather than a fabricated 14-field `Booking`: no case below calls it, and inventing
  // a booking would assert nothing.
  const CLOSED: StateAfter = Object.freeze({
    entity: { kind: "position" as const, id: POSITION_ID },
    stage: "CLOSED",
    version: 2,
    changedAt: AT,
    cascaded: [],
    events: [],
  });

  const openInside: AdminOnBehalf = {
    advance: async () => ok(CLOSED),
    listAllowed: async () => ["P-7"],
    chooseSlot: async () => ok(CLOSED),
    moveSlot: async () => ok({ kind: "call", state: CLOSED }),
    clearSlot: async () => ok(CLOSED),
    recordOutcome: async () => ok({ kind: "call", state: CLOSED }),
    bookNannyCall: async () => MATCHING_UNAVAILABLE,
    autofire: async () => MATCHING_UNAVAILABLE,
  };

  it("gates an inside that gates nothing itself", async () => {
    configureAdminOnBehalf(openInside);

    const result = await advanceAs(CALLER_ADMIN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("UNAUTHENTICATED");
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
  });

  it("gates that inside's levers too, and offers it no levers to render", async () => {
    configureAdminOnBehalf(openInside);

    const cleared = await adminOnBehalf.clearSlot(
      POSITION_ID,
      CALLER_ADMIN,
      "position-closed",
    );

    expect(cleared.ok).toBe(false);
    await expect(
      adminOnBehalf.listAllowed(
        { kind: "position", id: POSITION_ID },
        CALLER_ADMIN,
      ),
    ).resolves.toEqual([]);
  });

  it("reaches the inside once the session is an MFA-verified admin", async () => {
    configureAdminOnBehalf(openInside);
    signedInAs("admin", true);

    const result = await advanceAs(CALLER_ADMIN);

    expect(result.ok).toBe(true);
  });
});

/** One typed refusal for every double in this file — nothing here is meant to succeed. */
const MATCHING_UNAVAILABLE = {
  ok: false as const,
  error: {
    code: "INTERNAL" as const,
    message: "Not available in this test",
    details: { reason: "test-double-unavailable" as const },
  },
};
