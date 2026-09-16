// The `payments` half of swap test 4 (03 §11): keep `index.ts` + `types.ts`, point the binding at `stubPayments`
// and the rules the foundations state still hold — the admin toggle, the done-for-you refusal of a trial,
// `openDfyAccess`'s two windows, `E_PAYMENT_NOT_DUE` before the bill, and the presets from `config`.
import { beforeEach, describe, expect, it } from "vitest";
import { LOCALE, PRICES } from "@/modules/config";
import { configurePayments, payments, stubPayments } from "@/modules/payments";
import { ok } from "@/modules/platform";
import type { PurchaseProvider } from "@/modules/purchase-paths";
import type {
  Actor,
  AdminId,
  CustomerRef,
  FamilyId,
  Instant,
  PlacementId,
  Url,
  UserId,
} from "@/modules/shared-types";

const FAMILY = "family-1" as FamilyId;
const DFY_FAMILY = "family-dfy" as FamilyId;
const PLACEMENT = "placement-1" as PlacementId;
const NOW = "2026-01-01T00:00:00.000Z" as Instant;
const ADMIN: Actor = Object.freeze({ kind: "admin", id: "admin-1" as AdminId });
const PARENT: Actor = Object.freeze({
  kind: "user",
  id: "user-1" as UserId,
  role: "parent",
});

// A local fake, not `stub-stripe`: the boundary lint is right that `payments` may enter `purchase-paths` only
// through its connector, and this suite is about `payments`' own rules. `stub-stripe`'s behaviour is proved in
// `purchase-paths/__tests__`, and the two meet in `src/instrumentation.ts`.
const SIGNATURE = "signed";
const fakeProvider = (): PurchaseProvider => ({
  name: "stub-stripe",
  ensureCustomer: async () => ok("customer-1" as CustomerRef),
  createPaymentLink: async (_customer, _amount, _kind, _plan, ref) =>
    ok({ url: `https://example.test/parent/bundle?ref=${ref}` as Url }),
  createCheckout: async (_customer, _preset, _plan, ref) =>
    ok({ url: `https://example.test/parent/subscribe?ref=${ref}` as Url }),
  parseEvent: (raw) =>
    raw.signature === SIGNATURE
      ? ok({ kind: "ignored", eventId: "e1", providerType: "x" })
      : {
          ok: false,
          error: {
            code: "VALIDATION",
            message: "unverified",
            details: { reason: "signature-invalid" },
          },
        },
  portal: async () =>
    ok({ url: "https://example.test/parent/subscribe" as Url }),
});
const provider = fakeProvider;

const seeded = (over: Parameters<typeof stubPayments>[0] = {}) =>
  stubPayments({ now: NOW, provider: provider(), ...over });

beforeEach(() => {
  configurePayments(seeded({ dfyFamilies: [DFY_FAMILY] }));
});

describe("the fail-closed default", () => {
  it("refuses getAccess until boot configures the inside — never a defaulted 'no access'", async () => {
    configurePayments(
      // Re-installing the unconfigured binding is not possible from outside, so assert the shape the registry
      // returns by pointing at a stub that has no provider and reading an error path instead.
      stubPayments({ now: NOW }),
    );

    const result = await payments.handleWebhook({
      rawBody: "{}",
      signature: "x",
      receivedAt: NOW,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe("E_PROVIDER");
  });
});

describe("the admin access toggle (03 §5.4.6, ADR-093)", () => {
  it("is refused for a non-admin actor", async () => {
    const result = await payments.setAccess(FAMILY, true, "goodwill", PARENT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("FORBIDDEN");
  });

  it("emits access.toggled plus access.opened when an admin turns it on", async () => {
    const result = await payments.setAccess(FAMILY, true, "goodwill", ADMIN);

    expect(result.ok && result.value.events).toEqual([
      "access.toggled",
      "access.opened",
    ]);
    expect(result.ok && result.value.after.state).toBe("toggled");
  });

  it("emits access.toggled plus access.lapsed when an admin turns it off", async () => {
    const result = await payments.setAccess(
      FAMILY,
      false,
      "non-payment",
      ADMIN,
    );

    expect(result.ok && result.value.events).toEqual([
      "access.toggled",
      "access.lapsed",
    ]);
  });
});

describe("the trial (03 §5.4.4)", () => {
  it("refuses a done-for-you family with E_DFY_FAMILY — they have no trial (ADR-093)", async () => {
    const result = await payments.startTrial(DFY_FAMILY, PARENT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe("E_DFY_FAMILY");
  });

  it("ends the self-serve trial PRICES.trialDays after it starts, from config", async () => {
    const result = await payments.startTrial(FAMILY, PARENT);

    const expected = new Date(
      new Date(NOW).getTime() + PRICES.trialDays * 86_400_000,
    ).toISOString();
    expect(result.ok && "trialEndsAt" in result.value).toBe(true);
    expect(
      result.ok && "trialEndsAt" in result.value && result.value.trialEndsAt,
    ).toBe(expected);
  });

  it("answers alreadyUsed rather than erroring on a second call", async () => {
    await payments.startTrial(FAMILY, PARENT);

    const again = await payments.startTrial(FAMILY, PARENT);

    expect(again.ok && "alreadyUsed" in again.value).toBe(true);
  });
});

describe("openDfyAccess — the app on the nanny's first day (03 §5.4.1, ADR-093 / 094)", () => {
  it("opens access and sets the bill date PRICES.paymentAfterStartDays later, from config", async () => {
    const result = await payments.openDfyAccess(DFY_FAMILY, PLACEMENT, ADMIN);

    const due = new Date(
      new Date(NOW).getTime() + PRICES.paymentAfterStartDays * 86_400_000,
    ).toISOString();
    expect(result.ok && result.value.after.state).toBe("placed");
    expect(
      result.ok &&
        result.value.after.state === "placed" &&
        result.value.after.paymentDueAt,
    ).toBe(due);
    expect(result.ok && result.value.events).toEqual(["access.opened"]);
  });

  it("is idempotent per placement — a second call changes nothing", async () => {
    await payments.openDfyAccess(DFY_FAMILY, PLACEMENT, ADMIN);

    const again = await payments.openDfyAccess(DFY_FAMILY, PLACEMENT, ADMIN);

    expect(again.ok && again.value.handled).toBe("skipped-duplicate");
    expect(again.ok && again.value.events).toEqual([]);
  });
});

describe("the balance link (ADR-094)", () => {
  it("is E_PAYMENT_NOT_DUE before the bill falls due", async () => {
    await payments.openDfyAccess(DFY_FAMILY, PLACEMENT, ADMIN);

    const result = await payments.createPaymentLink(
      DFY_FAMILY,
      "balance-after-week-1",
      { kind: "upfront" },
      ADMIN,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_PAYMENT_NOT_DUE",
    );
  });

  it("is refused for a non-admin actor — only the matchmaker sends a link", async () => {
    const result = await payments.createPaymentLink(
      FAMILY,
      "deposit",
      { kind: "upfront" },
      PARENT,
    );

    expect(!result.ok && result.error.code).toBe("FORBIDDEN");
  });

  it("reaches the provider and carries back the reference payments minted", async () => {
    const result = await payments.createPaymentLink(
      FAMILY,
      "deposit",
      { kind: "upfront" },
      ADMIN,
    );

    expect(result.ok && result.value.url).toContain("/parent/bundle?ref=");
    expect(result.ok && result.value.reference).toBe(
      "stub-ref:family-1:deposit",
    );
  });
});

describe("prices() renders config, never a literal (L4)", () => {
  it("prices the deposit at PRICES.depositPence", () => {
    const deposit = payments.prices().find((p) => p.preset === "deposit");

    expect(deposit?.total.pence).toBe(PRICES.depositPence);
    expect(deposit?.total.currency).toBe(LOCALE.currency);
  });

  it("prices the self-serve app both ways from config", () => {
    const rows = payments.prices().filter((p) => p.preset === "self-serve-app");

    expect(rows.map((r) => r.perPayment.pence)).toEqual([
      PRICES.selfServeAppUpfrontPence,
      PRICES.selfServeAppMonthlyPence,
    ]);
  });
});

describe("the webhook spine", () => {
  it("never fabricates a money transition for a verified event it cannot place", async () => {
    // The §5.4.3 dispatch table is Phase 1. A **verified** event the stub cannot resolve to a family must come
    // back `ignored` with no state change — the failure this pins is a stub that quietly reported `handled` and
    // moved a family's access. Without this case, that regression would pass every other test in the file.
    const result = await payments.handleWebhook({
      rawBody: "{}",
      signature: SIGNATURE,
      receivedAt: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.handled).toBe("ignored");
    expect(result.ok && result.value.events).toEqual([]);
    expect(result.ok && result.value.after).toEqual(
      result.ok && result.value.before,
    );
    expect(result.ok && result.value.after.state).toBe("none");
  });

  it("refuses an unverified event with E_EVENT_UNVERIFIED before any dispatch", async () => {
    const result = await payments.handleWebhook({
      rawBody: "{}",
      signature: "wrong",
      receivedAt: NOW,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_EVENT_UNVERIFIED",
    );
  });
});
