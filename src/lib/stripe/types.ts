/**
 * Shared TypeScript shapes for the subset of Stripe APIs Baby Bloom uses.
 * These are input shapes for the wrapper functions in this folder. Stripe
 * SDK types are imported elsewhere — these types stay BB-flavoured so the
 * call sites read like product code, not Stripe boilerplate.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §4 (module structure).
 */

import type { PaidPlan, RefundReasonCategory } from "@/types/payments";

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------
export interface GetOrCreateCustomerInput {
  /** Email captured at signup. Required for receipts + tax invoices. */
  email: string;
  /** Display name. Optional — Stripe Tax address-collection fills the rest. */
  name?: string;
  /** Internal Supabase auth user id, used as the idempotency key seed + metadata. */
  userId: string;
}

export interface GetOrCreateCustomerOutput {
  customerId: string;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------
export interface CreateCheckoutSessionInput {
  plan: PaidPlan;
  customerId: string;
  parentUserId: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * Optional bump used to scope the idempotency key. Defaults to 1. Bump it
   * when the parent has cancelled + is resubscribing — otherwise Stripe
   * returns the prior session.
   */
  cycleNumber?: number;
}

export interface CreateCheckoutSessionOutput {
  url: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Subscriptions (read + cancel)
// ---------------------------------------------------------------------------
export interface RetrievedSubscription {
  id: string;
  status: string;
  /** Unix seconds. Stripe's `current_period_end`. */
  currentPeriodEnd: number | null;
  customerId: string;
  cancelAtPeriodEnd: boolean;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------
export type StripeRefundReason =
  | "duplicate"
  | "fraudulent"
  | "requested_by_customer";

/**
 * BB's RefundReasonCategory is richer than Stripe's. The mapping lives at
 * the action layer (Phase 3); this type just lets call sites pass either.
 */
export interface CreateRefundInput {
  paymentIntentId: string;
  /** Optional partial-refund amount in cents (AUD). Omit for full refund. */
  amountCents?: number;
  /** Stripe-native reason. */
  reason?: StripeRefundReason;
  /** BB-side reason category, attached as metadata for audit. */
  bbReasonCategory?: RefundReasonCategory;
  /** BB-side refund_request id. Powers the idempotency key. */
  refundRequestId: string;
}

export interface CreateRefundOutput {
  refundId: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------
export interface CreatePortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export interface CreatePortalSessionOutput {
  url: string;
}
