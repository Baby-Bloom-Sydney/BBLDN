// The `admin-on-behalf` swap test (03 §11's L3 law over the lever set of 03 §10.1): keep `index.ts` +
// `types.ts`, swap the modules underneath, and the admin panels do not move.
//
// The property being pinned is P-1 (ADR-001): **an on-behalf move is the same move**. So each lever must forward
// to the module that owns it and return that module's result unchanged — a lever that invented its own answer
// would be a second stage model.
//
// The refusal cases here are **session-driven** since FIX-1 (REVIEW-1 C-1): authority is
// `auth.requireRole('admin')` with `mfaVerified` (07 §5.4 rows 1–2), applied to every lever at the
// `configureAdminOnBehalf` seam, and the `Actor` a caller passes carries only `onBehalfOf`. So a case that used
// to refuse "a non-admin actor" now signs a non-admin *session* in. The gate's own battery — MFA, the spoofed
// admin id, the required `onBehalfOf`, and the seam that cannot be configured ungated — is
// `admin-on-behalf.gate.test.ts`; this file stays about the swap law.
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
  UserId,
} from "@/modules/shared-types";

const POSITION_ID = "position-1" as PositionId;
const AT = "2026-01-01T00:00:00+00:00" as Instant;
const SIGNED_IN_ID = "22222222-2222-4222-8222-222222222222";

/** The caller's actor carries only the subject of the move; the admin id downstream is the session's. */
const ADMIN: Actor = Object.freeze({
  kind: "admin",
  id: "admin-1" as AdminId,
  onBehalfOf: {
    role: "parent" as const,
    id: "99999999-9999-4999-8999-999999999999" as UserId,
  },
});
const PARENT: Actor = Object.freeze({
  kind: "user",
  id: "user-1" as UserId,
  role: "parent",
});

const signedInAs = (role: "parent" | "admin"): void =>
  configureAuth(
    stubAuth({
      users: [
        {
          id: SIGNED_IN_ID,
          email: "gate-test@example.test" as Email,
          password: "pw",
          role,
          mfaVerified: true,
        },
      ],
      signedInUserId: SIGNED_IN_ID,
    }),
  );

beforeEach(() => {
  signedInAs("admin");
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configurePositions(stubPositions({ allowed: ["P-7", "K-24"], stages: {} }));
  configureCallLayer(
    stubCallLayer({
      calls: { [POSITION_ID]: { state: "awaiting-slot", type: "matchmaking" } },
    }),
  );
  // `admin-on-behalf` may not import `scoring` (01 §2.3), so the matching double is hand-written here rather
  // than built from `stubMatching` — which would have pulled `scoring` in through the test's own imports.
  configureMatching({
    autofire: async () => matchingUnavailable,
    quickMatch: async () => matchingUnavailable,
    preAuthMatch: async () => matchingUnavailable,
    resultsFor: async () => matchingUnavailable,

    listPublicNannies: async () => matchingUnavailable,
    getPublicNanny: async () => matchingUnavailable,
    saveLead: async () => matchingUnavailable,
    getLead: async () => matchingUnavailable,
    connect: async () => matchingUnavailable,
  });
  configureAdminOnBehalf(stubAdminOnBehalf());
});

describe("the levers of rows 3–8", () => {
  it("fails closed before boot configures the inside", async () => {
    configureAdminOnBehalf({
      advance: async () => notConfigured,
      listAllowed: async () => [],
      chooseSlot: async () => notConfigured,
      moveSlot: async () => notConfigured,
      clearSlot: async () => notConfigured,
      recordOutcome: async () => notConfigured,
      bookNannyCall: async () => notConfigured,
      autofire: async () => notConfigured,
    });

    const result = await adminOnBehalf.clearSlot(
      POSITION_ID,
      ADMIN,
      "position-closed",
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "admin-on-behalf-not-configured",
    );
  });

  it("fires the same transition the ordinary mover fires", async () => {
    registerSlice({
      entity: "position",
      handlers: [
        {
          id: "P-7",
          run: async (input) =>
            ok({
              entity: input.entity,
              stage: "CLOSED" as const,
              version: 2,
              changedAt: AT,
              cascaded: [],
              events: [],
            }),
        },
      ],
    });

    const result = await adminOnBehalf.advance({
      entity: { kind: "position", id: POSITION_ID },
      transition: "P-7",
      actor: ADMIN,
      payload: {},
      expectedFrom: "OPEN",
      idempotencyKey: "key-p7",
    });

    expect(result.ok && result.value.stage).toBe("CLOSED");
  });

  it("refuses a stage move when the session is not an admin", async () => {
    signedInAs("parent");

    const result = await adminOnBehalf.advance({
      entity: { kind: "position", id: POSITION_ID },
      transition: "P-7",
      actor: ADMIN,
      payload: {},
      expectedFrom: "OPEN",
      idempotencyKey: "key-p7-parent",
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("FORBIDDEN");
  });

  it("forwards a call lever to call-layer unchanged", async () => {
    const result = await adminOnBehalf.recordOutcome(
      { kind: "call", positionId: POSITION_ID },
      "proceeding",
      undefined,
      ADMIN,
    );

    expect(result.ok && result.value.kind).toBe("call");
  });

  it("renders no levers at all when the session is not an admin", async () => {
    signedInAs("parent");

    await expect(
      adminOnBehalf.listAllowed({ kind: "position", id: POSITION_ID }, PARENT),
    ).resolves.toEqual([]);
  });

  it("renders the levers positions allows for an admin", async () => {
    await expect(
      adminOnBehalf.listAllowed({ kind: "position", id: POSITION_ID }, ADMIN),
    ).resolves.toEqual(["P-7", "K-24"]);
  });

  it("refuses an on-behalf autofire when the session is not an admin", async () => {
    signedInAs("parent");

    const result = await adminOnBehalf.autofire(POSITION_ID, PARENT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
  });
});

const matchingUnavailable = {
  ok: false as const,
  error: {
    code: "INTERNAL" as const,
    message: "Matching is not configured",
    details: { reason: "matching-not-configured" as const },
  },
};

const notConfigured = {
  ok: false as const,
  error: {
    code: "INTERNAL" as const,
    message: "Admin-on-behalf is not configured",
    details: { reason: "admin-on-behalf-not-configured" as const },
  },
};
