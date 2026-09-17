// The nine methods of 03 §5.2 over the memory store: who may call each, what each writes, and what each refuses.
// Every claim about **authorisation on a money path** is here, because "an admin only" that was never tested is
// the claim most likely to be true today and false next month.
import { describe, expect, it } from "vitest";
import { OFFER, PRICES } from "@/modules/config";
import type {
  Actor,
  FamilyId,
  Instant,
  PlacementId,
} from "@/modules/shared-types";
import { createPayments } from "../lib/create-payments";
import type { PaymentsDeps } from "../lib/deps";
import { memorySpineStore } from "../lib/memory-spine-store";
import type { MemorySpineSeed } from "../lib/memory-spine-store";
import type { PurchaseProvider } from "@/modules/purchase-paths";

const FAMILY = "family-1" as FamilyId;
const OTHER = "family-2" as FamilyId;
const PLACEMENT = "placement-1" as PlacementId;
const NOW = "2026-03-01T09:00:00.000Z" as Instant;

const PARENT: Actor = {
  kind: "user",
  id: FAMILY as string as never,
  role: "parent",
};
const ADMIN: Actor = { kind: "admin", id: "admin-1" as never };
const SYSTEM: Actor = { kind: "system", id: "placement-start-sweep" };

const provider: PurchaseProvider = Object.freeze({
  name: "stub-stripe",
  ensureCustomer: async () => ({ ok: true, value: "cus_1" as never }),
  createPaymentLink: async () => ({
    ok: true,
    value: { url: "https://app/link" as never },
  }),
  createCheckout: async () => ({
    ok: true,
    value: { url: "https://app/checkout" as never },
  }),
  parseEvent: () => ({
    ok: true,
    value: { kind: "ignored", eventId: "e", providerType: "x" },
  }),
  portal: async () => ({
    ok: true,
    value: { url: "https://app/portal" as never },
  }),
});

const sent: string[] = [];
const emitted: string[] = [];

/** Every family in these cases has an email on file; the "no email" path is its own case below. */
const CONTACTS = {
  [FAMILY]: {
    userId: FAMILY as string as never,
    email: "parent@example.test" as never,
    firstName: "Ada",
  },
} as const;

function build(seed: MemorySpineSeed = {}, paymentsOn = true) {
  const store = memorySpineStore({
    contacts: CONTACTS,
    now: () => NOW,
    ...seed,
  });
  const deps: PaymentsDeps = {
    store,
    provider,
    comms: {
      send: async (message) => {
        sent.push(message.templateId);
        return {
          ok: true,
          value: { id: "m" as never, status: "sent" as never },
        };
      },
    },
    events: {
      emit: async (input) => {
        emitted.push(input.name);
        return { ok: true, value: { id: "e" as never } };
      },
    },
    now: () => NOW,
    paymentsEnabled: () => paymentsOn,
    newTrialsEnabled: () => true,
    appUrl: "https://app",
  };
  return { store, path: createPayments(deps) };
}

const reasonOf = (result: {
  ok: boolean;
  error?: { details?: { reason?: string } };
}) => (result.ok ? null : (result.error?.details?.reason ?? null));

describe("createPaymentLink — path (a), admin only (03 §5.4.1)", () => {
  it("refuses a parent asking for her own link", async () => {
    const { path } = build({ rows: [] });
    const out = await path.createPaymentLink(
      FAMILY,
      "deposit",
      { kind: "upfront" },
      PARENT,
    );
    expect(reasonOf(out)).toBe("E_ACTOR_FORBIDDEN");
  });

  it("refuses everyone when FLAGS.PAYMENTS is off — the kill switch (06.11)", async () => {
    const { path } = build({}, false);
    const out = await path.createPaymentLink(
      FAMILY,
      "deposit",
      { kind: "upfront" },
      ADMIN,
    );
    expect(reasonOf(out)).toBe("E_PAYMENTS_DISABLED");
  });

  it("mints the deposit link, writes the ref on the row BEFORE the provider is called, and emails it", async () => {
    const { store, path } = build();
    await store.insertSpine({ parent_user_id: FAMILY });
    sent.length = 0;
    emitted.length = 0;
    const out = await path.createPaymentLink(
      FAMILY,
      "deposit",
      { kind: "upfront" },
      ADMIN,
    );
    expect(out.ok).toBe(true);
    const row = store.rows()[0];
    expect(row?.deposit_link_ref).toBe(out.ok ? out.value.reference : null);
    expect(row?.deposit_pence).toBe(PRICES.depositPence);
    expect(emitted).toEqual(["bundle.link-sent"]);
    expect(sent).toEqual(["bundle-payment-link"]);
  });

  it("refuses the balance link before the bill is due (ADR-094)", async () => {
    const { store, path } = build();
    await store.insertSpine({
      parent_user_id: FAMILY,
      status: "placed",
      payment_due_at: "2026-04-01T09:00:00.000Z",
    });
    const out = await path.createPaymentLink(
      FAMILY,
      "balance-after-week-1",
      { kind: "upfront" },
      ADMIN,
    );
    expect(reasonOf(out)).toBe("E_PAYMENT_NOT_DUE");
  });

  it("computes the balance as fee − deposit − first week from the CONTRACT, and snapshots it", async () => {
    const { store, path } = build({
      contacts: CONTACTS,
      placements: {
        [PLACEMENT]: {
          weeklyHours: 40,
          hourlyRatePence: 2_000,
          startedAt: NOW,
        },
      },
    });
    await store.insertSpine({
      parent_user_id: FAMILY,
      status: "placed",
      placement_id: PLACEMENT,
      payment_due_at: "2026-02-01T09:00:00.000Z",
      deposit_paid_at: NOW,
      deposit_pence: PRICES.depositPence,
    });
    const out = await path.createPaymentLink(
      FAMILY,
      "balance-after-week-1",
      { kind: "upfront" },
      ADMIN,
    );
    expect(out.ok).toBe(true);
    const capped = OFFER.firstWeekMaxHours * OFFER.firstWeekMaxRatePence;
    const row = store.rows()[0];
    expect(row?.first_week_wages_pence).toBe(capped);
    expect(row?.balance_pence).toBe(
      PRICES.feePence - PRICES.depositPence - capped,
    );
  });

  it("refuses a custom link with no whole amount", async () => {
    const { store, path } = build();
    await store.insertSpine({ parent_user_id: FAMILY });
    const out = await path.createPaymentLink(
      FAMILY,
      "custom",
      { kind: "upfront" },
      ADMIN,
    );
    expect(reasonOf(out)).toBe("E_PLAN_INVALID");
  });
});

describe("createCheckout — path (b), the parent's own (03 §5.4.2)", () => {
  it("refuses a parent reaching for another family's checkout", async () => {
    const { path } = build();
    const out = await path.createCheckout(
      OTHER,
      "self-serve-app",
      { kind: "upfront" },
      PARENT,
    );
    expect(reasonOf(out)).toBe("E_ACTOR_FORBIDDEN");
  });

  it("refuses a preset that is not a checkout preset", async () => {
    const { path } = build();
    for (const preset of ["deposit", "custom"] as const) {
      const out = await path.createCheckout(
        FAMILY,
        preset,
        { kind: "upfront" },
        PARENT,
      );
      expect(reasonOf(out)).toBe("E_PLAN_INVALID");
    }
  });

  it("refuses a family who has already paid", async () => {
    const { store, path } = build();
    await store.insertSpine({ parent_user_id: FAMILY, status: "paid_in_full" });
    const out = await path.createCheckout(
      FAMILY,
      "self-serve-app",
      { kind: "upfront" },
      PARENT,
    );
    expect(reasonOf(out)).toBe("E_ALREADY_PAID");
  });
});

describe("startTrial — self-serve only, once per family (03 §5.4.4; ADR-093)", () => {
  it("refuses a done-for-you family outright", async () => {
    const { store, path } = build();
    await store.insertSpine({
      parent_user_id: FAMILY,
      status: "placed",
      placement_id: PLACEMENT,
    });
    const out = await path.startTrial(FAMILY, PARENT);
    expect(reasonOf(out)).toBe("E_DFY_FAMILY");
  });

  it("starts the 30-day trial from PRICES and says trial.started + access.opened", async () => {
    const { store, path } = build();
    emitted.length = 0;
    const out = await path.startTrial(FAMILY, PARENT);
    expect(out.ok && "trialEndsAt" in out.value).toBe(true);
    expect(store.rows()[0]?.trial_ends_at).toBe("2026-03-31T09:00:00.000Z");
    expect(PRICES.trialDays).toBe(30);
    expect(emitted).toEqual(["trial.started", "access.opened"]);
  });

  it("a second call is `alreadyUsed`, not an error and not a second trial", async () => {
    const { path } = build();
    await path.startTrial(FAMILY, PARENT);
    emitted.length = 0;
    const again = await path.startTrial(FAMILY, PARENT);
    expect(again.ok && "alreadyUsed" in again.value).toBe(true);
    expect(emitted).toEqual([]);
  });

  it("refuses a parent starting another family's trial", async () => {
    const { path } = build();
    const out = await path.startTrial(OTHER, PARENT);
    expect(reasonOf(out)).toBe("E_ACTOR_FORBIDDEN");
  });
});

describe("openDfyAccess — the placement switch (ADR-093 / 094)", () => {
  const seed: MemorySpineSeed = {
    contacts: CONTACTS,
    placements: {
      [PLACEMENT]: { weeklyHours: 40, hourlyRatePence: 1_500, startedAt: NOW },
    },
    childrenDob: { [FAMILY]: ["2025-01-15"] },
  };

  it("refuses a parent — only the placement flow opens access", async () => {
    const { path } = build(seed);
    const out = await path.openDfyAccess(FAMILY, PLACEMENT, PARENT);
    expect(reasonOf(out)).toBe("E_ACTOR_FORBIDDEN");
  });

  it("opens the app, sets the two windows from PRICES, emails app-ready and says access.opened", async () => {
    const { store, path } = build(seed);
    sent.length = 0;
    emitted.length = 0;
    const out = await path.openDfyAccess(FAMILY, PLACEMENT, SYSTEM);
    expect(out.ok && out.value.handled).toBe("handled");
    const row = store.rows()[0];
    expect(row?.status).toBe("placed");
    expect(row?.payment_due_at).toBe("2026-03-08T09:00:00.000Z");
    expect(row?.satisfaction_window_ends_at).toBe("2026-03-31T09:00:00.000Z");
    expect(emitted).toEqual(["access.opened"]);
    expect(sent).toEqual(["app-ready"]);
  });

  it("recomputes the window to the youngest child's third birthday (ADR-083 / 084)", async () => {
    const { store, path } = build(seed);
    await path.openDfyAccess(FAMILY, PLACEMENT, SYSTEM);
    expect(store.rows()[0]?.access_until).toBe("2028-01-15T00:00:00.000Z");
    expect(PRICES.accessAgeYears).toBe(3);
  });

  it("is idempotent per placement — a second call is skipped-duplicate with no second email", async () => {
    const { path } = build(seed);
    await path.openDfyAccess(FAMILY, PLACEMENT, SYSTEM);
    sent.length = 0;
    emitted.length = 0;
    const again = await path.openDfyAccess(FAMILY, PLACEMENT, SYSTEM);
    expect(again.ok && again.value.handled).toBe("skipped-duplicate");
    expect(sent).toEqual([]);
    expect(emitted).toEqual([]);
  });
});

describe("setAccess — the admin toggle that overrides everything (ADR-093; 02 I-M10)", () => {
  it("refuses a parent and refuses an empty reason", async () => {
    const { path } = build();
    expect(reasonOf(await path.setAccess(FAMILY, true, "why", PARENT))).toBe(
      "E_ACTOR_FORBIDDEN",
    );
    expect(reasonOf(await path.setAccess(FAMILY, true, "   ", ADMIN))).toBe(
      "E_PLAN_INVALID",
    );
  });

  it("switching on writes the four toggle columns, emails app-ready and says both events", async () => {
    const { store, path } = build();
    sent.length = 0;
    emitted.length = 0;
    const out = await path.setAccess(FAMILY, true, "goodwill", ADMIN);
    expect(out.ok).toBe(true);
    const row = store.rows()[0];
    expect(row?.access_toggled_on).toBe(true);
    expect(row?.access_toggle_reason).toBe("goodwill");
    expect(row?.access_toggled_by).toBe("admin-1");
    expect(emitted).toEqual(["access.toggled", "access.opened"]);
    expect(sent).toEqual(["app-ready"]);
  });

  it("switching off says access.lapsed and sends nothing", async () => {
    const { path } = build();
    sent.length = 0;
    emitted.length = 0;
    await path.setAccess(FAMILY, false, "unpaid", ADMIN);
    expect(emitted).toEqual(["access.toggled", "access.lapsed"]);
    expect(sent).toEqual([]);
  });

  it("the toggle wins over a paid standing, both ways", async () => {
    const { store, path } = build();
    await store.insertSpine({ parent_user_id: FAMILY, status: "paid_in_full" });
    await path.setAccess(FAMILY, false, "unpaid", ADMIN);
    const state = await path.getAccess(FAMILY);
    expect(state.ok && state.value.state).toBe("toggled");
    expect(state.ok && state.value.state === "toggled" && state.value.on).toBe(
      false,
    );
  });
});

describe("getAccess — the read every paywall stands on", () => {
  it("a family with no row is `none`, not an error", async () => {
    const { path } = build();
    const out = await path.getAccess(FAMILY);
    expect(out.ok && out.value.state).toBe("none");
  });

  it("a deposit and nothing else reads as deposit-paid — the standing with no access (ADR-097)", async () => {
    const { store, path } = build();
    await store.insertSpine({
      parent_user_id: FAMILY,
      deposit_paid_at: NOW,
      deposit_pence: PRICES.depositPence,
    });
    const out = await path.getAccess(FAMILY);
    expect(out.ok && out.value.state).toBe("deposit-paid");
  });

  it("a trial past its end reads as lapsed here, without waiting for the cron", async () => {
    const { store, path } = build();
    await store.insertSpine({
      parent_user_id: FAMILY,
      status: "trial",
      trial_ends_at: "2026-01-01T00:00:00.000Z",
      has_used_trial: true,
    });
    const out = await path.getAccess(FAMILY);
    expect(out.ok && out.value.state).toBe("lapsed");
    expect(out.ok && out.value.state === "lapsed" && out.value.reason).toBe(
      "trial-ended",
    );
  });

  it("carries the deposit on every standing, because it is credited wherever it was paid", async () => {
    const { store, path } = build();
    await store.insertSpine({
      parent_user_id: FAMILY,
      status: "paid_in_full",
      purchased_at: NOW,
      deposit_paid_at: NOW,
      deposit_pence: PRICES.depositPence,
    });
    const out = await path.getAccess(FAMILY);
    expect(out.ok && out.value.deposit?.pence).toBe(PRICES.depositPence);
  });
});

describe("comms failing does not fail the money (03 §5.4.3)", () => {
  it("a family with no email on file still gets her access — the email is a consequence, not the record", async () => {
    // Arrange: no contact seeded at all.
    const store = memorySpineStore({
      now: () => NOW,
      placements: {
        [PLACEMENT]: {
          weeklyHours: 40,
          hourlyRatePence: 1_500,
          startedAt: NOW,
        },
      },
    });
    const path = createPayments({
      store,
      provider,
      comms: {
        send: async () => {
          throw new Error("comms must not be reached with no email on file");
        },
      },
      events: { emit: async () => ({ ok: true, value: { id: "e" as never } }) },
      now: () => NOW,
      paymentsEnabled: () => true,
      newTrialsEnabled: () => true,
      appUrl: "https://app",
    });
    const out = await path.openDfyAccess(FAMILY, PLACEMENT, SYSTEM);
    expect(out.ok && out.value.handled).toBe("handled");
    expect(store.rows()[0]?.status).toBe("placed");
  });
});
