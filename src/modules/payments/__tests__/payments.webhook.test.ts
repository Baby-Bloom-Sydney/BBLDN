// The completion spine (03 §5.4.3), in the order the contract fixes. Four claims this merge rests on, each of
// which is the kind that is true on the day it is written and quietly false a month later:
//
//   · the signature is verified BEFORE anything is parsed or dispatched (07 §10.1);
//   · the ledger insert happens BEFORE dispatch, so a replay is `skipped-duplicate` and changes nothing (AC-P-54);
//   · an event whose `LinkRef` we never minted is `ignored` with a 200, never a 4xx a provider stops retrying on;
//   · a failed transition stamps `processing_error` so the provider retries and the runbook can see it.
import { describe, expect, it } from "vitest";
import { PRICES } from "@/modules/config";
import type { FamilyId, Instant, LinkRef, RawProviderEvent } from "@/modules/shared-types";
import type { PurchaseEvent, PurchaseProvider } from "@/modules/purchase-paths";
import { createPayments } from "../lib/create-payments";
import { memorySpineStore } from "../lib/memory-spine-store";
import { mintLinkRef } from "../lib/mint-link-ref";

// A real uuid, because `mintLinkRef` / `parseLinkRef` validate the shape: the family half of a `LinkRef` must
// be a uuid or the webhook cannot resolve it, and a fixture that ignores that would test the wrong refusal.
const FAMILY = "11111111-2222-4333-8444-555555555555" as FamilyId;
const NOW = "2026-03-01T09:00:00.000Z" as Instant;
const money = (pence: number) => ({ pence, currency: "GBP" }) as const;

const raw = (body: unknown, signature = "good"): RawProviderEvent => ({
  rawBody: JSON.stringify(body),
  signature,
  receivedAt: NOW,
});

/** Records whether it was ever asked to parse, so "verified first" is observable rather than assumed. */
function fakeProvider(next: () => PurchaseEvent | null) {
  const seen: string[] = [];
  const provider: PurchaseProvider = {
    name: "stub-stripe",
    ensureCustomer: async () => ({ ok: true, value: "cus" as never }),
    createPaymentLink: async () => ({ ok: true, value: { url: "u" as never } }),
    createCheckout: async () => ({ ok: true, value: { url: "u" as never } }),
    portal: async () => ({ ok: true, value: { url: "u" as never } }),
    parseEvent: (input) => {
      seen.push(input.signature);
      if (input.signature !== "good")
        return {
          ok: false,
          error: {
            code: "VALIDATION",
            message: "no",
            details: { reason: "signature-invalid" as const },
          },
        } as never;
      const event = next();
      return event === null
        ? ({
            ok: false,
            error: {
              code: "VALIDATION",
              message: "no",
              details: { reason: "signature-invalid" as const },
            },
          } as never)
        : { ok: true, value: event };
    },
  };
  return { provider, seen };
}

function build(event: PurchaseEvent | null, rows: Parameters<typeof memorySpineStore>[0] = {}) {
  const store = memorySpineStore({ now: () => NOW, ...rows });
  const { provider, seen } = fakeProvider(() => event);
  const path = createPayments({
    store,
    provider,
    comms: {
      send: async () => ({ ok: true, value: { id: "m" as never, status: "sent" as never } }),
    },
    events: { emit: async () => ({ ok: true, value: { id: "e" as never } }) },
    now: () => NOW,
    paymentsEnabled: () => true,
    newTrialsEnabled: () => true,
    appUrl: "https://app",
  });
  return { store, path, seen };
}

describe("verification comes first (07 §10.1)", () => {
  it("an unverified body is E_EVENT_UNVERIFIED and writes NOTHING — no ledger row, no spine row", async () => {
    const { store, path } = build(null);
    const out = await path.handleWebhook(raw({ anything: true }, "forged"));
    expect(out.ok).toBe(false);
    expect(out.ok ? null : out.error.details?.reason).toBe("E_EVENT_UNVERIFIED");
    expect(store.events()).toEqual([]);
    expect(store.rows()).toEqual([]);
  });

  it("the provider is handed the raw signature, never a parsed body", async () => {
    const { path, seen } = build(null);
    await path.handleWebhook(raw({ a: 1 }, "forged"));
    expect(seen).toEqual(["forged"]);
  });
});

describe("idempotency — the ledger insert precedes dispatch (AC-P-54)", () => {
  const ref = mintLinkRef(FAMILY, "checkout");
  const event: PurchaseEvent = {
    kind: "purchase.completed",
    eventId: "evt-replay",
    ref,
    linkKind: "checkout",
    preset: "self-serve-app",
    shape: { kind: "upfront" },
    paid: money(PRICES.selfServeAppUpfrontPence),
    at: NOW,
  };

  it("the first delivery is handled and moves the standing", async () => {
    const { store, path } = build(event);
    await store.insertSpine({ parent_user_id: FAMILY });
    const out = await path.handleWebhook(raw(event));
    expect(out.ok && out.value.handled).toBe("handled");
    expect(store.rows()[0]?.status).toBe("paid_in_full");
  });

  it("a replay of the same eventId is skipped-duplicate and changes NOTHING", async () => {
    const { store, path } = build(event);
    await store.insertSpine({ parent_user_id: FAMILY });
    await path.handleWebhook(raw(event));
    const before = store.rows()[0];
    const again = await path.handleWebhook(raw(event));
    expect(again.ok && again.value.handled).toBe("skipped-duplicate");
    expect(store.rows()[0]).toEqual(before);
    expect(store.events()).toHaveLength(1);
  });
});

describe("an event we cannot place", () => {
  it("a LinkRef we never minted is `ignored` with a family of none — a 200, never a 4xx", async () => {
    const event: PurchaseEvent = {
      kind: "purchase.completed",
      eventId: "evt-stranger",
      ref: "not-ours" as LinkRef,
      linkKind: "checkout",
      preset: "self-serve-app",
      shape: { kind: "upfront" },
      paid: money(100),
      at: NOW,
    };
    const { store, path } = build(event);
    const out = await path.handleWebhook(raw(event));
    expect(out.ok && out.value.handled).toBe("ignored");
    expect(out.ok && out.value.after.state).toBe("none");
    // The ledger still carries the delivery, stamped, so the runbook can see what arrived.
    expect(store.events()).toHaveLength(1);
    expect(store.events()[0]?.processed_at).toBe(NOW);
  });

  it("a provider event type we do not handle is `ignored`, stamped, and moves nothing", async () => {
    const { store, path } = build({
      kind: "ignored",
      eventId: "evt-payout",
      providerType: "payout.paid",
    });
    const out = await path.handleWebhook(raw({ type: "payout.paid" }));
    expect(out.ok && out.value.handled).toBe("ignored");
    expect(store.rows()).toEqual([]);
  });
});

describe("07 §8 row 13 — no rate limit on this path, by design", () => {
  it("the route file says so and consumes no limiter", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const route = readFileSync(
      resolve(__dirname, "../../../app/api/webhooks/stripe/route.ts"),
      "utf8",
    );
    // A limiter here would drop events a provider then stops retrying — which on a money spine loses a payment.
    expect(route).not.toMatch(/rateLimiter|consume/u);
    expect(route).toContain("07 §8 row 13");
  });
});
