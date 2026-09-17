// The negative half of the boot claim (ADR-120 / ADR-123 rule 1): **with the wiring absent, every port still
// fails closed.** This file never imports `src/instrumentation.ts` or `src/boot/wire-ports.ts`, so every call
// below runs against the real factory default of each module — vitest isolates module state per file, which is
// the only way to reach those defaults from outside the modules (REVIEW-1's `*.fail-closed.test.ts` pattern).
// The positive half, `boot.test.ts`, runs the boot and proves each default was replaced.
import { describe, expect, it } from "vitest";
import { areas } from "@/modules/areas";
import { auth } from "@/modules/auth";
import { callLayer } from "@/modules/call-layer";
import { comms } from "@/modules/comms";
import { matching } from "@/modules/matching";
import {
  consent,
  Events,
  ok,
  unitOfWorkJoin,
  withUnitOfWork,
} from "@/modules/platform";
import { advance, positions } from "@/modules/positions";
import { scheduling } from "@/modules/scheduling";
import { scoring } from "@/modules/scoring";
import type {
  Email,
  ParentId,
  PositionId,
  UnitOfWork,
  UserId,
} from "@/modules/shared-types";

const FOREIGN = {} as UnitOfWork;
const DISTRICT = Object.freeze({ area: "Lambeth", district: "SW4" });
const POSITION = "0f1e2d3c-0000-4000-8000-000000000001" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-000000000011" as UserId;
// The `ParentId` / `UserId` seam `1e` recorded: `findLive` is keyed by `ParentId` (03 §2.5 `JourneyOwner`) and
// a session carries a `UserId`. The same id, two brands — spelled out here rather than cast at the call site.
const PARENT_OWNER = PARENT as unknown as ParentId;
const reasonOf = (result: { ok: boolean }): unknown =>
  "error" in result
    ? (result as { error: { details?: { reason?: unknown } } }).error.details
        ?.reason
    : undefined;

describe("every port fails closed until src/instrumentation.ts wires it", () => {
  it("unit of work — the module-level withUnitOfWork and join refuse", async () => {
    const result = await withUnitOfWork(async () => ok(1));
    expect(reasonOf(result)).toBe("unit-of-work-not-configured");
    expect(unitOfWorkJoin.isOpen(FOREIGN)).toBe(false);
    expect(reasonOf(unitOfWorkJoin.claimRpc(FOREIGN))).toBe(
      "unit-of-work-unknown",
    );
  });

  it("auth — a { uow } no binding holds open is refused before the operation runs", async () => {
    const result = await auth.data.run(
      {
        name: "auth.probe",
        exec: async () => {
          throw new Error("must not run");
        },
      },
      { uow: FOREIGN },
    );
    expect(reasonOf(result)).toBe("unit-of-work-unknown");
  });

  it("events — an emit that asks to join a unit of work fails the caller (the store refuses the row)", async () => {
    const result = await Events.emit(
      {
        name: "consent.updated",
        actor: { kind: "anonymous" },
        props: { marketing: false, necessary: true },
      },
      { uow: FOREIGN },
    );
    expect(reasonOf(result)).toBe("event-log");
    const page = await Events.queryEvents({});
    expect(reasonOf(page)).toBe("events-not-configured");
  });

  it("consent — hasMarketing included, so no pixel / CAPI can slip through (07 §2.9)", async () => {
    const marketing = await consent.hasMarketing({
      kind: "visitor",
      id: "v" as never,
    });
    expect(reasonOf(marketing)).toBe("consent-not-configured");
  });

  it("areas · comms · scheduling — each answers its own not-configured reason", async () => {
    expect(reasonOf(await areas.lookupArea("SW4"))).toBe(
      "areas-not-configured",
    );
    expect(
      reasonOf(
        await comms.send({
          channel: "email",
          templateId: "welcome-parent",
          to: { email: "someone@example.test" as Email },
          data: {},
        }),
      ),
    ).toBe("comms-not-configured");
    expect(
      reasonOf(
        await scheduling.expireHolds("2026-09-17T09:00:00.000Z" as never),
      ),
    ).toBe("SCHEDULING_NOT_CONFIGURED");
  });

  // P1-WIRE-2. The three ports 1b and 1d left owed. Each has a real inside now, so the fail-closed default is
  // the only thing standing between an unwired boot and a made-up answer on a parent's screen: an empty result
  // set read as the true one (`matching`), a score nobody computed (`scoring`), a call said to be booked when
  // nothing says so (`call-layer`). Each must still refuse with its own reason, and say which port it was.
  it("positions — the reads answer `positions-not-configured` and the P rows are not registered (AUTH-2)", async () => {
    expect(reasonOf(await positions.findLive(PARENT_OWNER))).toBe(
      "positions-not-configured",
    );
    const moved = await advance({
      transition: "P-2",
      entity: { kind: "position", id: POSITION },
      actor: { kind: "system", id: "signup-convert-lead" },
      payload: {
        parentId: PARENT,
        source: "signup",
        detail: { district: "SW4" },
      },
      expectedFrom: null,
      idempotencyKey: "fail-closed-probe-p2",
    } as never);
    expect(reasonOf(moved)).toBe("E_SLICE_NOT_REGISTERED");
  });

  it("scoring · matching · call-layer — each answers its own not-configured reason (03 §7.2 · §10.1 · §2.7)", async () => {
    expect(reasonOf(await scoring.quickMatch(null, DISTRICT, []))).toBe(
      "scoring-not-configured",
    );
    expect(reasonOf(await matching.quickMatch(null, DISTRICT))).toBe(
      "matching-not-configured",
    );
    expect(reasonOf(await callLayer.findOpenCall(PARENT))).toBe(
      "call-layer-not-configured",
    );
  });

  it("the C-row slice is unregistered, so advance refuses rather than dispatching nowhere (03 §2.1)", async () => {
    // The second half of `call-layer`'s wiring: `configureCallLayer` installs the orchestrator, but the C rows
    // reach the stage model only through `registerCallLayerSlice`. A `{ uow }` is passed so `advance` takes the
    // caller's branch and the refusal is the registry's, not a unit of work's.
    const moved = await advance({
      transition: "C-a",
      entity: { kind: "call", id: POSITION },
      actor: { kind: "system", id: "call-request" },
      payload: { parentId: PARENT, type: "matchmaking", recipient: "parent" },
      expectedFrom: null,
      idempotencyKey: "fail-closed-probe",
      uow: FOREIGN,
    });
    expect(reasonOf(moved)).toBe("E_SLICE_NOT_REGISTERED");
  });
});
