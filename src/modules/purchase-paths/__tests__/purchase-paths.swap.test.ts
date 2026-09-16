// The `purchase-paths` half of swap test 4 (03 §11): keep `index.ts` + `types.ts`, point the binding at a
// provider, and everything above still runs. Plus the three guards of 07 §5.5 that make the stub safe.
import { beforeEach, describe, expect, it } from "vitest";
import {
  configurePurchaseProvider,
  purchaseProvider,
} from "@/modules/purchase-paths";
import { stubStripe } from "@/modules/purchase-paths/providers/stub-stripe";
import type {
  CustomerRef,
  Email,
  FamilyId,
  Instant,
  LinkRef,
  RawProviderEvent,
} from "@/modules/shared-types";

const SECRET = "stub-event-secret-for-tests";
const APP_URL = "https://example.test";
const FAMILY = "family-1" as FamilyId;
const REF = "ref-1" as LinkRef;
const AT = "2026-01-01T00:00:00+00:00" as Instant;
const CUSTOMER = "stub:family-1" as CustomerRef;
const MONEY = { pence: 1, currency: "GBP" } as const; // config-literal-ok: a fixture for a field 03 §5.2 types as this literal

const provider = () =>
  stubStripe({
    eventSecret: SECRET,
    environment: "development",
    appUrl: APP_URL,
  });

const raw = (body: unknown, signature: string): RawProviderEvent => ({
  rawBody: JSON.stringify(body),
  signature,
  receivedAt: AT,
});

const completed = {
  kind: "purchase.completed",
  eventId: "evt-1",
  ref: REF,
  linkKind: "deposit",
  preset: "deposit",
  shape: { kind: "upfront" },
  paid: MONEY,
  at: AT,
};

describe("the fail-closed default", () => {
  it("refuses every method until boot configures a provider, rather than pretending to charge", async () => {
    const result = await purchaseProvider.ensureCustomer({
      id: FAMILY,
      email: "a@example.test" as Email,
      name: "A",
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "provider-not-configured",
    );
  });
});

describe("stub-stripe, once the binding points at it", () => {
  beforeEach(() => {
    configurePurchaseProvider(provider());
  });

  it("names itself so a stub row can never be mistaken for money (07 §5.5)", () => {
    expect(purchaseProvider.name).toBe("stub-stripe");
  });

  it("mints an in-app customer ref rather than calling a provider", async () => {
    const result = await purchaseProvider.ensureCustomer({
      id: FAMILY,
      email: "a@example.test" as Email,
      name: "A",
    });

    expect(result.ok && result.value).toBe(CUSTOMER);
  });

  it("returns in-app link and checkout URLs carrying the ref payments minted", async () => {
    const link = await purchaseProvider.createPaymentLink(
      CUSTOMER,
      MONEY,
      "deposit",
      { kind: "upfront" },
      REF,
      AT,
    );
    const checkout = await purchaseProvider.createCheckout(
      CUSTOMER,
      "self-serve-app",
      { kind: "upfront" },
      REF,
      { success: `${APP_URL}/ok` as never, cancel: `${APP_URL}/no` as never },
    );

    expect(link.ok && link.value.url).toBe(
      `${APP_URL}/parent/bundle?ref=${REF}`,
    );
    expect(checkout.ok && checkout.value.url).toBe(
      `${APP_URL}/parent/subscribe?ref=${REF}`,
    );
  });
});

describe("parseEvent fails closed (07 §5.5 layer 3)", () => {
  beforeEach(() => {
    configurePurchaseProvider(provider());
  });

  it("accepts an event that carries the shared secret", () => {
    const result = purchaseProvider.parseEvent(raw(completed, SECRET));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.kind).toBe("purchase.completed");
  });

  it("refuses a wrong secret", () => {
    const result = purchaseProvider.parseEvent(raw(completed, "wrong"));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "signature-invalid",
    );
  });

  it("refuses an empty secret — an unset secret must never read as authorised", () => {
    expect(purchaseProvider.parseEvent(raw(completed, "")).ok).toBe(false);
  });

  it("refuses a body that is not valid JSON", () => {
    expect(
      purchaseProvider.parseEvent({
        rawBody: "{not json",
        signature: SECRET,
        receivedAt: AT,
      }).ok,
    ).toBe(false);
  });

  it("refuses a well-signed body that does not satisfy the event schema", () => {
    const result = purchaseProvider.parseEvent(
      raw({ kind: "purchase.completed", eventId: "evt-2" }, SECRET),
    );

    expect(result.ok).toBe(false);
  });

  it("refuses a negative amount — money is an integer in pence, never a float or a debit", () => {
    const result = purchaseProvider.parseEvent(
      raw({ ...completed, paid: { ...MONEY, pence: -1 } }, SECRET),
    );

    expect(result.ok).toBe(false);
  });

  it("refuses a currency the contract does not allow", () => {
    const result = purchaseProvider.parseEvent(
      raw({ ...completed, paid: { pence: 1, currency: "AUD" } }, SECRET), // config-literal-ok: the rejected currency is the point of the case
    );

    expect(result.ok).toBe(false);
  });
});

describe("the production guard (07 §5.5 layer 1)", () => {
  it("refuses to construct in a production-resolved environment", () => {
    expect(() =>
      stubStripe({
        eventSecret: SECRET,
        environment: "production",
        appUrl: APP_URL,
      }),
    ).toThrow(/production/);
  });

  it("is available in preview, where the stub is the point", () => {
    expect(() =>
      stubStripe({
        eventSecret: SECRET,
        environment: "preview",
        appUrl: APP_URL,
      }),
    ).not.toThrow();
  });
});
