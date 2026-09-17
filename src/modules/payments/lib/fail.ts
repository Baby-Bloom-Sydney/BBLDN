// 03 §5.3 — every `E_*` reason with the `ErrorCode` that is its envelope status, in one place so a reason can
// never travel under two codes. The message is a plain sentence a parent may read; nothing provider-specific.
import { err } from "@/modules/platform";
import type { AppError, ErrorCode } from "@/modules/shared-types";
import type { PaymentsErrorDetails, PaymentsErrorReason } from "../types";

const CODE_FOR: Readonly<Record<PaymentsErrorReason, ErrorCode>> = Object.freeze({
  E_FAMILY_NOT_FOUND: "NOT_FOUND",
  E_ACTOR_FORBIDDEN: "FORBIDDEN",
  E_PLAN_INVALID: "VALIDATION",
  E_ALREADY_PAID: "CONFLICT",
  E_TRIAL_USED: "CONFLICT",
  E_LINK_EXPIRED: "CONFLICT",
  E_PAYMENTS_DISABLED: "CONFLICT",
  E_EVENT_UNVERIFIED: "VALIDATION",
  E_EVENT_UNRESOLVED: "NOT_FOUND",
  E_PROVIDER: "PROVIDER_ERROR",
  E_TEST_USER: "FORBIDDEN",
  E_DFY_FAMILY: "CONFLICT",
  E_PAYMENT_NOT_DUE: "CONFLICT",
  "payments-not-configured": "INTERNAL",
});

export function fail(
  reason: PaymentsErrorReason,
  message: string,
  provider?: string,
): { readonly ok: false; readonly error: AppError<PaymentsErrorDetails> } {
  return err(CODE_FOR[reason], message, {
    reason,
    ...(provider === undefined ? {} : { provider }),
  });
}
