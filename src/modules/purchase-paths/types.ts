// purchase-paths — the swappable payment provider behind `payments` (03 §5.2, ADR-024 / ADR-068). This module
// holds **no state** and knows nothing about families, access or money rules: it turns a `payments` request into
// a provider URL and a provider callback into a `PurchaseEvent`. Every amount reaching it was computed by
// `payments` from `PRICES` (L4) — there is no literal price in this module (01 §3.2 rule 1).
import type {
  CustomerRef,
  Email,
  FamilyId,
  Instant,
  LinkRef,
  RawProviderEvent,
  Result,
  Url,
} from "@/modules/shared-types";

/** Integer minor units, never a float and never a formatted string (01 §4c rule 3). */
export type Money = { readonly pence: number; readonly currency: "GBP" }; // config-literal-ok: 03 §5.2 and 01 §4c rule 3 state this literal — it is the contract's type, and `LOCALE.currency` is the value

/** `upfront` or `instalments{X}`; `count` is `PRICES.bundleMonthlyCount` (03 §5.2). */
export type PlanShape =
  | { readonly kind: "upfront" }
  | { readonly kind: "instalments"; readonly count: number };

/** What an admin-triggered payment link is for (03 §5.2; ADR-085 / 094 / 097). */
export type LinkKind = "deposit" | "balance-after-week-1" | "custom";

/** Which `PRICES` preset supplies the amount; `custom` carries a per-family amount (03 §5.2). */
export type PricePreset =
  | "deposit"
  | "balance-after-week-1"
  | "self-serve-app"
  | "custom";

/** A preset rendered for S-P-10 / S-P-11; `label` is a copy key, never the copy (00-glossary §6). */
export type Price = {
  readonly preset: PricePreset;
  readonly shape: PlanShape;
  readonly perPayment: Money;
  readonly total: Money;
  readonly label: string;
};

/** The provider-neutral facts `payments` dispatches on (03 §5.2). `ignored` is a 200, never an error. */
export type PurchaseEvent =
  | {
      readonly kind: "purchase.completed";
      readonly eventId: string;
      readonly ref: LinkRef;
      readonly linkKind: LinkKind | "checkout";
      readonly preset: PricePreset;
      readonly shape: PlanShape;
      readonly paid: Money;
      readonly at: Instant;
    }
  | {
      readonly kind: "instalment.paid";
      readonly eventId: string;
      readonly ref: LinkRef;
      readonly index: number;
      readonly paid: Money;
      readonly at: Instant;
    }
  | {
      readonly kind: "instalment.failed";
      readonly eventId: string;
      readonly ref: LinkRef;
      readonly index: number;
      readonly at: Instant;
    }
  | {
      readonly kind: "schedule.cancelled";
      readonly eventId: string;
      readonly ref: LinkRef;
      readonly at: Instant;
      readonly paidCount: number;
    }
  | {
      readonly kind: "refunded";
      readonly eventId: string;
      readonly ref: LinkRef;
      readonly amount: Money;
      readonly at: Instant;
    }
  | {
      readonly kind: "ignored";
      readonly eventId: string;
      readonly providerType: string;
    };

/** `details.reason` on every `purchase-paths` error; `payments` maps them to 03 §5.3's `E_*` vocabulary. */
export type PurchasePathsErrorDetails = {
  readonly reason:
    | "provider-not-configured"
    | "stub-refused-in-production"
    | "signature-invalid"
    | "provider-failed";
  readonly provider?: string;
};

export type PurchaseResult<T> = Result<T, PurchasePathsErrorDetails>;

/** The family facts a provider needs to mint a customer — no other family data crosses this boundary. */
export type PurchaseCustomer = {
  readonly id: FamilyId;
  readonly email: Email;
  readonly name: string;
};

/** Where a hosted checkout sends the browser back to (03 §5.2). */
export type CheckoutReturnTo = { readonly success: Url; readonly cancel: Url };

/**
 * The swap surface (03 §5.2). `name` is the env binding `PURCHASE_PROVIDER`; swapping to `stripe-uk` is an env
 * change plus Stripe Dashboard objects and nothing outside `providers/` moves (03 §5.5).
 */
export interface PurchaseProvider {
  readonly name: "stripe-uk" | "stub-stripe";
  ensureCustomer(
    family: PurchaseCustomer,
  ): Promise<PurchaseResult<CustomerRef>>;
  createPaymentLink(
    customer: CustomerRef,
    amount: Money,
    kind: LinkKind,
    plan: PlanShape,
    ref: LinkRef,
    expiresAt: Instant,
  ): Promise<PurchaseResult<{ readonly url: Url }>>;
  createCheckout(
    customer: CustomerRef,
    preset: PricePreset,
    plan: PlanShape,
    ref: LinkRef,
    returnTo: CheckoutReturnTo,
  ): Promise<PurchaseResult<{ readonly url: Url }>>;
  /** Verifies the signature **before** parsing; an unverified body is never dispatched (07 §10.1). */
  parseEvent(raw: RawProviderEvent): PurchaseResult<PurchaseEvent>;
  portal(
    customer: CustomerRef,
    returnTo: Url,
  ): Promise<PurchaseResult<{ readonly url: Url }>>;
}
