// A `scheduling` failure as a `call-layer` failure (03 §2.7 "errors as §2.5 plus §3.4"): the §3.4 reasons the
// closed union names pass through unchanged; anything else is `E_PRECONDITION_FAILED { which: <reason> }`, so
// the caller still sees the scheduling word without the union growing on every provider error.
import { err } from "@/modules/platform";
import type { AppError } from "@/modules/shared-types";
import type { SchedulingErrorDetails } from "@/modules/scheduling";
import type { CallErrorDetails } from "../types";

const PASS_THROUGH = new Set<CallErrorDetails["reason"]>([
  "SLOT_TAKEN",
  "SLOT_OUTSIDE_WINDOW",
  "SLOT_BLOCKED",
  "HOLD_EXPIRED",
  "HOLD_NOT_YOURS",
  "ALREADY_BOOKED",
  "NOT_IMPLEMENTED",
  "SCHEDULING_NOT_CONFIGURED",
]);

const isPassThrough = (
  reason: SchedulingErrorDetails["reason"],
): reason is CallErrorDetails["reason"] & SchedulingErrorDetails["reason"] =>
  (PASS_THROUGH as ReadonlySet<string>).has(reason);

export function schedulingError(error: AppError<SchedulingErrorDetails>): {
  readonly ok: false;
  readonly error: AppError<CallErrorDetails>;
} {
  const reason = error.details?.reason;
  if (reason !== undefined && isPassThrough(reason))
    return err<CallErrorDetails>(error.code, error.message, { reason });
  return err<CallErrorDetails>(error.code, error.message, {
    reason: "E_PRECONDITION_FAILED",
    ...(reason === undefined ? {} : { which: reason }),
  });
}
