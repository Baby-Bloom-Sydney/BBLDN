// The `payments` stub — the half of swap test 4 that lets `access-gate`, the rail, the admin ledger and
// `startTrial` be built and tested before the money tables exist (03 §11 row 4: "reverse: `payments` stubbed →
// `access-gate`, rail, ledger, `startTrial` still run").
//
// It implements only rules the foundations **state**: the admin toggle (03 §5.4.6), the self-serve trial and the
// done-for-you refusal (§5.4.4), `openDfyAccess` and its two windows (§5.4.1), `E_PAYMENT_NOT_DUE` before the
// bill falls due (ADR-094) and the presets from `PRICES` (L4). The webhook dispatch table of §5.4.3 is **not**
// here — it is Phase 1 business logic, and a stub that guessed at money transitions would be worse than one that
// refuses. Every amount comes from `config`; there is no literal in this file.
import { LOCALE, PRICES } from "@/modules/config";
import { err, ok } from "@/modules/platform";
import type { PurchaseProvider } from "@/modules/purchase-paths";
import type { Money, PlanShape, Price } from "@/modules/purchase-paths";
import type {
  Actor,
  FamilyId,
  Instant,
  LinkRef,
  PlacementId,
  RawProviderEvent,
} from "@/modules/shared-types";
import type {
  AccessChange,
  AccessState,
  PaymentsErrorReason,
  PurchasePath,
} from "./types";

export type StubPaymentsSeed = {
  readonly access?: Readonly<Record<string, AccessState>>;
  /** Families on the done-for-you path — they have no trial (ADR-093). */
  readonly dfyFamilies?: ReadonlyArray<FamilyId>;
  /** Injected so the link / checkout / portal calls reach a real provider in the swap test. */
  readonly provider?: PurchaseProvider;
  readonly now?: Instant;
};

const MS_PER_DAY = 86_400_000;
const NONE: AccessState = Object.freeze({ state: "none" });

const fail = (reason: PaymentsErrorReason, message: string) =>
  err(
    reason === "E_ACTOR_FORBIDDEN"
      ? "FORBIDDEN"
      : reason === "E_EVENT_UNVERIFIED"
        ? "VALIDATION"
        : "CONFLICT",
    message,
    { reason },
  );

// The currency is read from `config`, never written here (L4 — 01 §3.2 rule 1); the cast is to 03 §5.2's
// literal type, which is the contract's, not a second source of truth.
const pence = (amount: number): Money => ({
  pence: amount,
  currency: LOCALE.currency as Money["currency"],
});

function addDays(from: Instant, days: number): Instant {
  return new Date(
    new Date(from).getTime() + days * MS_PER_DAY,
  ).toISOString() as Instant;
}

/** The presets `PRICES` states an amount for; the per-family ones are computed by the inside (03 §5.2). */
function presetPrices(): ReadonlyArray<Price> {
  const upfront: PlanShape = { kind: "upfront" };
  const monthly: PlanShape = {
    kind: "instalments",
    count: PRICES.bundleMonthlyCount,
  };
  return Object.freeze([
    {
      preset: "deposit" as const,
      shape: upfront,
      perPayment: pence(PRICES.depositPence),
      total: pence(PRICES.depositPence),
      label: "price.deposit",
    },
    {
      preset: "self-serve-app" as const,
      shape: upfront,
      perPayment: pence(PRICES.selfServeAppUpfrontPence),
      total: pence(PRICES.selfServeAppUpfrontPence),
      label: "price.self-serve-app.upfront",
    },
    {
      preset: "self-serve-app" as const,
      shape: monthly,
      perPayment: pence(PRICES.selfServeAppMonthlyPence),
      total: pence(PRICES.selfServeAppMonthlyPence * PRICES.bundleMonthlyCount),
      label: "price.self-serve-app.monthly",
    },
  ]);
}

function toggledChange(
  familyId: FamilyId,
  before: AccessState,
  on: boolean,
  reason: string,
  actor: Extract<Actor, { kind: "admin" }>,
  at: Instant,
  until?: Instant,
): AccessChange {
  const after: AccessState = {
    state: "toggled",
    on,
    accessUntil: null,
    reason,
    toggledBy: actor.id,
    at,
    ...(until === undefined ? {} : { until }),
  };
  return Object.freeze({
    familyId,
    before,
    after,
    events: Object.freeze(
      on
        ? (["access.toggled", "access.opened"] as const)
        : (["access.toggled", "access.lapsed"] as const),
    ),
    handled: "handled" as const,
  });
}

export function stubPayments(seed: StubPaymentsSeed = {}): PurchasePath {
  const now = seed.now ?? (new Date(0).toISOString() as Instant);
  const dfy = new Set<string>(seed.dfyFamilies ?? []);
  const states = new Map<string, AccessState>(
    Object.entries(seed.access ?? {}),
  );
  const provider = seed.provider;
  const noProvider = () =>
    err("INTERNAL", "Stub payments has no provider", {
      reason: "E_PROVIDER" as const,
      provider: "none",
    });
  const readAccess = (familyId: FamilyId): AccessState =>
    states.get(familyId) ?? NONE;

  const linkDue = (familyId: FamilyId): boolean => {
    const state = readAccess(familyId);
    return state.state === "placed" && state.paymentDueAt <= now;
  };

  // Declared, then frozen: the annotation is what contextually types every arrow below; an outer `as`
  // cast would infer them away and silently widen the parameters.
  const path: PurchasePath = {
    prices: presetPrices,

    getAccess: async (familyId) => ok(readAccess(familyId)),

    setAccess: async (familyId, on, reason, actor, until) => {
      if (actor.kind !== "admin")
        return fail("E_ACTOR_FORBIDDEN", "Only an admin may toggle access");
      const before = readAccess(familyId);
      const change = toggledChange(
        familyId,
        before,
        on,
        reason,
        actor,
        now,
        until,
      );
      states.set(familyId, change.after);
      return ok(change);
    },

    startTrial: async (familyId) => {
      if (dfy.has(familyId))
        return fail("E_DFY_FAMILY", "A done-for-you family has no trial");
      const before = readAccess(familyId);
      if (before.state !== "none") return ok({ alreadyUsed: true as const });
      const trialEndsAt = addDays(now, PRICES.trialDays);
      states.set(familyId, { state: "trial", accessUntil: null, trialEndsAt });
      return ok({ trialEndsAt });
    },

    openDfyAccess: async (familyId, _placementId: PlacementId) => {
      const before = readAccess(familyId);
      if (before.state === "placed")
        return ok(
          Object.freeze({
            familyId,
            before,
            after: before,
            events: Object.freeze([]),
            handled: "skipped-duplicate" as const,
          }),
        );
      const after: AccessState = {
        state: "placed",
        accessUntil: null,
        startedAt: now,
        paymentDueAt: addDays(now, PRICES.paymentAfterStartDays),
        balance: pence(PRICES.feePence),
        firstWeekWages: pence(0),
        satisfactionWindowEndsAt: addDays(now, PRICES.satisfactionWindowDays),
      };
      states.set(familyId, after);
      return ok(
        Object.freeze({
          familyId,
          before,
          after,
          events: Object.freeze(["access.opened"] as const),
          handled: "handled" as const,
        }),
      );
    },

    createPaymentLink: async (familyId, kind, plan, actor, custom) => {
      if (actor.kind !== "admin")
        return fail("E_ACTOR_FORBIDDEN", "Only an admin may send a link");
      if (kind === "balance-after-week-1" && !linkDue(familyId))
        return fail("E_PAYMENT_NOT_DUE", "The bill is not due yet");
      if (provider === undefined) return noProvider();
      const reference = `stub-ref:${familyId}:${kind}` as LinkRef;
      const expiresAt = addDays(now, PRICES.linkTtlDays);
      const amount = custom ?? pence(PRICES.depositPence);
      const link = await provider.createPaymentLink(
        `stub:${familyId}` as never,
        amount,
        kind,
        plan,
        reference,
        expiresAt,
      );
      if (!link.ok) return fail("E_PROVIDER", "The provider refused the link");
      return ok({ url: link.value.url, reference, expiresAt });
    },

    createCheckout: async (familyId, preset, plan) => {
      if (provider === undefined) return noProvider();
      const reference = `stub-ref:${familyId}:${preset}` as LinkRef;
      const checkout = await provider.createCheckout(
        `stub:${familyId}` as never,
        preset,
        plan,
        reference,
        { success: "" as never, cancel: "" as never },
      );
      if (!checkout.ok)
        return fail("E_PROVIDER", "The provider refused the checkout");
      return ok({ url: checkout.value.url });
    },

    handleWebhook: async (event: RawProviderEvent) => {
      if (provider === undefined) return noProvider();
      const parsed = provider.parseEvent(event);
      if (!parsed.ok)
        return fail("E_EVENT_UNVERIFIED", "The event is not verified");
      // The §5.4.3 dispatch table is Phase 1; a verified event the stub cannot place is `ignored`, never a
      // guessed money transition.
      return ok(
        Object.freeze({
          familyId: "" as FamilyId,
          before: NONE,
          after: NONE,
          events: Object.freeze([]),
          handled: "ignored" as const,
        }),
      );
    },

    portal: async (familyId) => {
      if (provider === undefined) return noProvider();
      const result = await provider.portal(
        `stub:${familyId}` as never,
        "" as never,
      );
      if (!result.ok) return fail("E_PROVIDER", "The provider refused");
      return ok(result.value);
    },
  };
  return Object.freeze(path);
}
