// The negative half of the boot claim (ADR-120 / ADR-123 rule 1): **with the wiring absent, every port still
// fails closed.** This file never imports `src/instrumentation.ts` or `src/boot/wire-ports.ts`, so every call
// below runs against the real factory default of each module — vitest isolates module state per file, which is
// the only way to reach those defaults from outside the modules (REVIEW-1's `*.fail-closed.test.ts` pattern).
// The positive half, `boot.test.ts`, runs the boot and proves each default was replaced.
import { describe, expect, it } from "vitest";
import { areas } from "@/modules/areas";
import { auth } from "@/modules/auth";
import { comms } from "@/modules/comms";
import {
  consent,
  Events,
  ok,
  unitOfWorkJoin,
  withUnitOfWork,
} from "@/modules/platform";
import { scheduling } from "@/modules/scheduling";
import type { Email, UnitOfWork } from "@/modules/shared-types";

const FOREIGN = {} as UnitOfWork;
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
});
