// Swap test 4's reverse direction (03 §11 row 4): "`payments` stubbed → `access-gate` … still run". Every row of
// the gate table, both sides of the admin override, and the `accessUntil` expiry.
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessGate,
  decideAccess,
  stubAccessGate,
} from "@/modules/access-gate";
import type { AccessState } from "@/modules/payments";
import { configurePayments, stubPayments } from "@/modules/payments";
import type { AdminId, FamilyId, Instant } from "@/modules/shared-types";

const FAMILY = "family-1" as FamilyId;
const NOW = "2026-06-01T00:00:00.000Z" as Instant;
const PAST = "2026-01-01T00:00:00.000Z" as Instant;
const FUTURE = "2030-01-01T00:00:00.000Z" as Instant;
const ADMIN = "admin-1" as AdminId;
const MONEY = { pence: 0, currency: "GBP" } as const; // config-literal-ok: a fixture for a field 03 §5.2 types as this literal

const placed: AccessState = {
  state: "placed",
  accessUntil: FUTURE,
  startedAt: PAST,
  paymentDueAt: FUTURE,
  balance: MONEY,
  firstWeekWages: MONEY,
  satisfactionWindowEndsAt: FUTURE,
};

describe("the gate table (03 §5.2 / §5.4.5)", () => {
  it("closes for a family with no record", () => {
    expect(decideAccess({ state: "none" }, NOW).open).toBe(false);
  });

  it("closes on deposit-paid — the deposit secures the place and opens nothing (ADR-097)", () => {
    const decision = decideAccess(
      { state: "deposit-paid", depositPaidAt: PAST, pence: 1 },
      NOW,
    );

    expect(decision.open).toBe(false);
    expect(decision.reason).toBe("deposit-paid");
  });

  it("opens on placed — the app is on from the nanny's first day, before any bill (ADR-093)", () => {
    expect(decideAccess(placed, NOW).open).toBe(true);
  });

  it("opens on trial, active and paid-in-full", () => {
    const states: ReadonlyArray<AccessState> = [
      { state: "trial", accessUntil: FUTURE, trialEndsAt: FUTURE },
      {
        state: "active",
        accessUntil: FUTURE,
        shape: { kind: "upfront" },
        paidCount: 1,
        remaining: 0,
        nextPaymentAt: null,
        standing: "good",
      },
      {
        state: "paid-in-full",
        accessUntil: FUTURE,
        shape: { kind: "upfront" },
        paidAt: PAST,
      },
    ];

    expect(states.map((state) => decideAccess(state, NOW).open)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("closes on lapsed", () => {
    expect(
      decideAccess(
        { state: "lapsed", lapsedAt: PAST, reason: "trial-ended" },
        NOW,
      ).open,
    ).toBe(false);
  });
});

describe("the admin override beats every other standing, both ways (ADR-093)", () => {
  it("opens an unpaid family when the admin turns it on", () => {
    const decision = decideAccess(
      {
        state: "toggled",
        on: true,
        accessUntil: FUTURE,
        reason: "goodwill",
        toggledBy: ADMIN,
        at: PAST,
      },
      NOW,
    );

    expect(decision.open).toBe(true);
    expect(decision.reason).toBe("toggled-on");
  });

  it("closes a paid family when the admin turns it off", () => {
    const decision = decideAccess(
      {
        state: "toggled",
        on: false,
        accessUntil: FUTURE,
        reason: "non-payment",
        toggledBy: ADMIN,
        at: PAST,
      },
      NOW,
    );

    expect(decision.open).toBe(false);
    expect(decision.reason).toBe("toggled-off");
  });

  it("honours the toggle's own `until` ahead of accessUntil", () => {
    const decision = decideAccess(
      {
        state: "toggled",
        on: true,
        accessUntil: FUTURE,
        reason: "trial extension",
        toggledBy: ADMIN,
        at: PAST,
        until: PAST,
      },
      NOW,
    );

    expect(decision.until).toBe(PAST);
    expect(decision.open).toBe(false);
  });
});

describe("accessUntil — the youngest child's third birthday (ADR-083 / 084)", () => {
  it("closes an otherwise-open standing once it has passed, without waiting for the cron", () => {
    const decision = decideAccess({ ...placed, accessUntil: PAST }, NOW);

    expect(decision.open).toBe(false);
    expect(decision.reason).toBe("access-ended");
  });

  it("leaves the gate open while nothing bounds it — no child linked yet", () => {
    const decision = decideAccess({ ...placed, accessUntil: null }, NOW);

    expect(decision.open).toBe(true);
    expect(decision.until).toBeNull();
  });
});

describe("hasAccess reads payments and never defaults", () => {
  beforeEach(() => {
    configurePayments(stubPayments({ now: NOW, access: { [FAMILY]: placed } }));
  });

  it("answers from the standing payments holds", async () => {
    const result = await accessGate.hasAccess(FAMILY, NOW);

    expect(result.ok && result.value.open).toBe(true);
    expect(result.ok && result.value.reason).toBe("placed");
  });

  it("closes for a family payments knows nothing about", async () => {
    const result = await accessGate.hasAccess("family-x" as FamilyId, NOW);

    expect(result.ok && result.value.open).toBe(false);
  });
});

describe("the stub gate runs the real rule", () => {
  it("agrees with decideAccess, so a stubbed gate can never drift from the live one", async () => {
    const gate = stubAccessGate({ [FAMILY]: placed });

    const result = await gate.hasAccess(FAMILY, NOW);

    expect(result.ok && result.value).toEqual(decideAccess(placed, NOW));
  });
});
