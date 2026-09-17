// The completion spine (03 §5.4.3), in the order the contract fixes. Four claims this merge rests on, each of
// which is the kind that is true on the day it is written and quietly false a month later:
//
//   · the signature is verified BEFORE anything is parsed or dispatched (07 §10.1);
//   · the ledger insert happens BEFORE dispatch, so a replay is `skipped-duplicate` and changes nothing (AC-P-54);
//   · an event whose `LinkRef` we never minted is `ignored` with a 200, never a 4xx a provider stops retrying on;
//   · a failed transition stamps `processing_error` so the provider retries and the runbook can see it.
import { describe, expect, it } from "vitest";
import { PRICES } from "@/modules/config";
import type {
  FamilyId,
  Instant,
  LinkRef,
  RawProviderEvent,
} from "@/modules/shared-types";
import type { PurchaseEvent, PurchaseProvider } from "@/modules/purchase-paths";
import { createPayments } from "../lib/create-payments";
import { blankSpineRow } from "../lib/blank-spine-row";
import { memorySpineStore } from "../lib/memory-spine-store";
import { mintLinkRef } from "../lib/mint-link-ref";

// A real uuid, because `mintLinkRef` / `parseLinkRef` validate the shape: the family half of a `LinkRef` must
// be a uuid or the webhook cannot resolve it, and a fixture that ignores that would test the wrong refusal.
const FAMILY = "11111111-2222-4333-8444-555555555555" as FamilyId;
const NOW = "2026-03-01T09:00:00.000Z" as Instant;
// config-literal-ok: 03 §5.2 types `Money.currency` as the literal "GBP"; a fixture builder states the type
const money = (pence: number) => ({ pence, currency: "GBP" }) as const; // config-literal-ok: 03 §5.2 types `Money.currency` as this literal; a fixture builder states the type

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

function build(
  event: PurchaseEvent | null,
  rows: Parameters<typeof memorySpineStore>[0] = {},
) {
  const store = memorySpineStore({ now: () => NOW, ...rows });
  const { provider, seen } = fakeProvider(() => event);
  const path = createPayments({
    store,
    provider,
    comms: {
      send: async () => ({ ok: true, value: "m" as never }),
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
    expect(out.ok ? null : out.error.details?.reason).toBe(
      "E_EVENT_UNVERIFIED",
    );
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
    await store.insertSpine({
      parent_user_id: FAMILY as string,
      status: "lapsed",
    });
    const out = await path.handleWebhook(raw(event));
    expect(out.ok && out.value.handled).toBe("handled");
    expect(store.rows()[0]?.status).toBe("paid_in_full");
  });

  it("a replay of the same eventId is skipped-duplicate and changes NOTHING", async () => {
    const { store, path } = build(event);
    await store.insertSpine({
      parent_user_id: FAMILY as string,
      status: "lapsed",
    });
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

// --------------------------------------------------------------------------- 0019: the fold

describe("ADR-127 — the ledger row, the spine and the stamp are one transaction (0019)", () => {
  const ref = mintLinkRef(FAMILY, "checkout");
  const paid: PurchaseEvent = {
    kind: "purchase.completed",
    eventId: "evt-fold",
    ref,
    linkKind: "checkout",
    preset: "self-serve-app",
    shape: { kind: "upfront" },
    paid: money(PRICES.selfServeAppUpfrontPence),
    at: NOW,
  };

  /** A store that records the order the spine asked for things, so "one write" is observable. */
  const recording = (rows: Parameters<typeof memorySpineStore>[0] = {}) => {
    const inner = memorySpineStore({ now: () => NOW, ...rows });
    const order: string[] = [];
    const store = {
      ...inner,
      applyEvent: async (delivery: Parameters<typeof inner.applyEvent>[0]) => {
        order.push("applyEvent");
        return inner.applyEvent(delivery);
      },
      updateSpine: async (
        id: Parameters<typeof inner.updateSpine>[0],
        patch: Parameters<typeof inner.updateSpine>[1],
      ) => {
        order.push("updateSpine");
        return inner.updateSpine(id, patch);
      },
      setAccessWindow: async (
        familyId: Parameters<typeof inner.setAccessWindow>[0],
        years: Parameters<typeof inner.setAccessWindow>[1],
      ) => {
        order.push("setAccessWindow");
        return inner.setAccessWindow(familyId, years);
      },
      stampEvent: async (
        id: Parameters<typeof inner.stampEvent>[0],
        patch: Parameters<typeof inner.stampEvent>[1],
      ) => {
        order.push("stampEvent");
        return inner.stampEvent(id, patch);
      },
    };
    return { inner, store, order };
  };

  const pathOver = (store: unknown, event: PurchaseEvent) => {
    const { provider } = fakeProvider(() => event);
    return createPayments({
      store: store as never,
      provider,
      comms: { send: async () => ({ ok: true, value: "m" as never }) },
      events: { emit: async () => ({ ok: true, value: { id: "e" as never } }) },
      now: () => NOW,
      paymentsEnabled: () => true,
      newTrialsEnabled: () => true,
      appUrl: "https://app",
    });
  };

  it("a paid delivery is ONE store write — no spine update and no stamp beside it", async () => {
    const { inner, store, order } = recording();
    await inner.insertSpine({
      parent_user_id: FAMILY as string,
      status: "lapsed",
    });
    const out = await pathOver(store, paid).handleWebhook(raw(paid));

    expect(out.ok && out.value.handled).toBe("handled");
    expect(order).toEqual(["applyEvent"]);
    expect(inner.rows()[0]?.status).toBe("paid_in_full");
    // and the ledger row is stamped by the same transaction, not by a second statement
    expect(inner.events()[0]?.processed_at).toBe(NOW);
    expect(inner.events()[0]?.parent_user_id).toBe(FAMILY);
  });

  it("carries the access window the transaction opened into the AccessChange it returns (ADR-083 / 084)", async () => {
    // The old spine read `after` off the row `updateSpine` returned, which predates `set_access_window` — so
    // a paid delivery answered with the window it had BEFORE the purchase moved it. The function returns
    // that instant, and the fold merges it.
    const { inner, store } = recording({
      childrenDob: { [FAMILY]: ["2025-01-15"] },
    });
    await inner.insertSpine({
      parent_user_id: FAMILY as string,
      status: "lapsed",
    });
    const out = await pathOver(store, paid).handleWebhook(raw(paid));

    const opened = new Date(
      Date.UTC(2025 + PRICES.accessAgeYears, 0, 15),
    ).toISOString();
    expect(inner.rows()[0]?.access_until).toBe(opened);
    // the half that was wrong before the fold: the answer the caller gets carries it too
    expect(
      out.ok && out.value.after.state === "paid-in-full"
        ? out.value.after.accessUntil
        : "not paid-in-full",
    ).toBe(opened);
  });

  it("a spine row that vanishes between the read and the write is refused, never invented — I-M1", async () => {
    // The only way `apply_payment_event`'s `E_SPINE_MISSING` is reachable from this spine: `resolveFamily`
    // reads the row first, so the row can only be gone if something deleted it in between. The function
    // stamps the ledger row `E_SPINE_MISSING` and answers `unresolved`; the webhook refuses rather than
    // reporting a transition that did not happen, and the provider retries.
    const { store, inner } = recording();
    const phantom = {
      ...blankSpineRow(FAMILY, NOW),
      id: "99999999-9999-4999-8999-999999999999",
      status: "lapsed" as const,
    };
    const racing = {
      ...store,
      readByFamily: async () => ({ ok: true as const, value: phantom }),
    };
    const out = await pathOver(racing, paid).handleWebhook(raw(paid));

    expect(out.ok).toBe(false);
    expect(inner.events()).toHaveLength(1);
    expect(inner.events()[0]?.processed_at).toBeNull();
    expect(inner.events()[0]?.processing_error).toBe("E_SPINE_MISSING");
  });

  it("an event type we do not handle is recorded and stamped — the one path that is still two statements", async () => {
    // `apply_payment_event` has no "seen, nothing to do" outcome: a null family is `unresolved` there, which
    // would leave a payout notification on the `processed_at IS NULL` index for ever. There is no money in
    // this path to be atomic with, and the second statement is stated in `webhook-method.ts` rather than hidden.
    const { store, inner, order } = recording();
    const ignoredEvent: PurchaseEvent = {
      kind: "ignored",
      eventId: "evt-payout-2",
      providerType: "payout.paid",
    };
    await pathOver(store, ignoredEvent).handleWebhook(
      raw({ t: "payout.paid" }),
    );

    expect(order).toEqual(["applyEvent", "stampEvent"]);
    expect(inner.events()[0]?.processed_at).toBe(NOW);
    expect(inner.events()[0]?.processing_error).toBeNull();
  });
});
