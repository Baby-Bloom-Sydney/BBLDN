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
  CustomerRef,
  FamilyId,
  Instant,
  LinkRef,
  Url,
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
const EPOCH = new Date(0).toISOString() as Instant;
/** The `ignored` webhook outcome has no family; see the GAP note on `handleWebhook`. */
const UNRESOLVED_FAMILY = "" as FamilyId;
/** The stub takes no money, so a hosted return URL is never followed; the in-app panel is the whole flow. */
const RETURN_TO = "" as Url;

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

// The currency is read from `config`, never written here (L4 — 01 §3.2 rule 1). No cast: `LOCALE.currency`
// already infers as the literal 03 §5.2 types `Money["currency"]` as, so a drift between the two is a compile
// error rather than something a cast would absorb.
const pence = (amount: number): Money => ({
  pence: amount,
  currency: LOCALE.currency,
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
  // Frozen before it is aliased: the same reference is stored in the stub's mutable map and returned to the
  // caller, and `readonly` on the type is a compile-time promise only.
  const after: AccessState = Object.freeze({
    state: "toggled" as const,
    on,
    accessUntil: null,
    reason,
    toggledBy: actor.id,
    at,
    ...(until === undefined ? {} : { until }),
  });
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

/** Everything the stub's method groups share; split out so no single function exceeds the 50-line rule. */
type StubContext = {
  readonly now: Instant;
  readonly dfy: ReadonlySet<string>;
  readonly states: Map<string, AccessState>;
  readonly provider?: PurchaseProvider;
};

const readAccess = (ctx: StubContext, familyId: FamilyId): AccessState =>
  ctx.states.get(familyId) ?? NONE;

const noProvider = () =>
  err("INTERNAL", "Stub payments has no provider", {
    reason: "E_PROVIDER" as const,
    provider: "none",
  });

/** The bill falls due `PRICES.paymentAfterStartDays` after the nanny's start; before that, `E_PAYMENT_NOT_DUE`. */
const linkDue = (ctx: StubContext, familyId: FamilyId): boolean => {
  const state = readAccess(ctx, familyId);
  return state.state === "placed" && state.paymentDueAt <= ctx.now;
};

const customerOf = (familyId: FamilyId) => `stub:${familyId}` as CustomerRef;

function accessMethods(
  ctx: StubContext,
): Pick<PurchasePath, "getAccess" | "setAccess" | "startTrial"> {
  return {
    getAccess: async (familyId) => ok(readAccess(ctx, familyId)),

    setAccess: async (familyId, on, reason, actor, until) => {
      if (actor.kind !== "admin")
        return fail("E_ACTOR_FORBIDDEN", "Only an admin may toggle access");
      const before = readAccess(ctx, familyId);
      const change = toggledChange(
        familyId,
        before,
        on,
        reason,
        actor,
        ctx.now,
        until,
      );
      ctx.states.set(familyId, change.after);
      return ok(change);
    },

    startTrial: async (familyId) => {
      if (ctx.dfy.has(familyId))
        return fail("E_DFY_FAMILY", "A done-for-you family has no trial");
      if (readAccess(ctx, familyId).state !== "none")
        return ok({ alreadyUsed: true as const });
      const trialEndsAt = addDays(ctx.now, PRICES.trialDays);
      ctx.states.set(
        familyId,
        Object.freeze({
          state: "trial" as const,
          accessUntil: null,
          trialEndsAt,
        }),
      );
      return ok({ trialEndsAt });
    },
  };
}

/** L-1b: the app on the nanny's first day, the bill a week later, the satisfaction window set (ADR-093 / 094). */
function dfyMethods(ctx: StubContext): Pick<PurchasePath, "openDfyAccess"> {
  return {
    openDfyAccess: async (familyId) => {
      const before = readAccess(ctx, familyId);
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
      const after: AccessState = Object.freeze({
        state: "placed" as const,
        accessUntil: null,
        startedAt: ctx.now,
        paymentDueAt: addDays(ctx.now, PRICES.paymentAfterStartDays),
        balance: pence(PRICES.feePence),
        // The real first-week discount is snapshotted from the placement's contracted hours and rate
        // (ADR-100); a stub has no placement to read, so it credits nothing rather than inventing a figure.
        firstWeekWages: pence(0),
        satisfactionWindowEndsAt: addDays(
          ctx.now,
          PRICES.satisfactionWindowDays,
        ),
      });
      ctx.states.set(familyId, after);
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
  };
}

function linkMethods(
  ctx: StubContext,
): Pick<PurchasePath, "createPaymentLink" | "createCheckout"> {
  return {
    createPaymentLink: async (familyId, kind, plan, actor, custom) => {
      if (actor.kind !== "admin")
        return fail("E_ACTOR_FORBIDDEN", "Only an admin may send a link");
      if (kind === "balance-after-week-1" && !linkDue(ctx, familyId))
        return fail("E_PAYMENT_NOT_DUE", "The bill is not due yet");
      if (ctx.provider === undefined) return noProvider();
      const reference = `stub-ref:${familyId}:${kind}` as LinkRef;
      const expiresAt = addDays(ctx.now, PRICES.linkTtlDays);
      const link = await ctx.provider.createPaymentLink(
        customerOf(familyId),
        custom ?? pence(PRICES.depositPence),
        kind,
        plan,
        reference,
        expiresAt,
      );
      if (!link.ok) return fail("E_PROVIDER", "The provider refused the link");
      return ok({ url: link.value.url, reference, expiresAt });
    },

    createCheckout: async (familyId, preset, plan) => {
      if (ctx.provider === undefined) return noProvider();
      const reference = `stub-ref:${familyId}:${preset}` as LinkRef;
      const checkout = await ctx.provider.createCheckout(
        customerOf(familyId),
        preset,
        plan,
        reference,
        { success: RETURN_TO, cancel: RETURN_TO },
      );
      if (!checkout.ok)
        return fail("E_PROVIDER", "The provider refused the checkout");
      return ok({ url: checkout.value.url });
    },
  };
}

function spineMethods(
  ctx: StubContext,
): Pick<PurchasePath, "handleWebhook" | "portal"> {
  return {
    handleWebhook: async (event) => {
      if (ctx.provider === undefined) return noProvider();
      if (!ctx.provider.parseEvent(event).ok)
        return fail("E_EVENT_UNVERIFIED", "The event is not verified");
      // The §5.4.3 dispatch table is Phase 1. A **verified** event the stub cannot place is `ignored` with no
      // state change — never a guessed money transition.
      //
      // GAP (L-005 F-c PROGRESS entry): 03 §5.2 makes `AccessChange.familyId` non-optional, but the `ignored`
      // outcome of §5.4.3 has no family by definition (no `LinkRef` we minted). `UNRESOLVED_FAMILY` is the
      // documented sentinel until the contract says which it is.
      return ok(
        Object.freeze({
          familyId: UNRESOLVED_FAMILY,
          before: NONE,
          after: NONE,
          events: Object.freeze([]),
          handled: "ignored" as const,
        }),
      );
    },

    portal: async (familyId) => {
      if (ctx.provider === undefined) return noProvider();
      const result = await ctx.provider.portal(customerOf(familyId), RETURN_TO);
      if (!result.ok) return fail("E_PROVIDER", "The provider refused");
      return ok(result.value);
    },
  };
}

export function stubPayments(seed: StubPaymentsSeed = {}): PurchasePath {
  const ctx: StubContext = {
    now: seed.now ?? EPOCH,
    dfy: new Set<string>(seed.dfyFamilies ?? []),
    states: new Map<string, AccessState>(Object.entries(seed.access ?? {})),
    ...(seed.provider === undefined ? {} : { provider: seed.provider }),
  };
  // Declared, then frozen: the annotation is what contextually types every arrow in the groups above; an outer
  // `as` cast would infer them away and silently widen the parameters.
  const path: PurchasePath = {
    prices: presetPrices,
    ...accessMethods(ctx),
    ...dfyMethods(ctx),
    ...linkMethods(ctx),
    ...spineMethods(ctx),
  };
  return Object.freeze(path);
}
