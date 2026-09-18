// The one INTERNAL refusal the wizard's actions answer for a store or provider failure (01 §4a): the reason is
// logged server-side, the form gets the generic line. Refusals that carry a reason a form can act on
// (`invalid_type`, `already-submitted`, `consent-required`, …) pass through unchanged — those are the nanny's.
import { err, log } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  VerificationActionDetails,
  VerificationErrorDetails,
} from "../types";

const HERS: ReadonlySet<string> = new Set([
  "invalid_type",
  "file_too_large",
  "missing_field",
  "already-submitted",
  "section-not-open",
  "consent-required",
  "notice-unavailable",
  "too-many-attempts",
  "unsupported-evidence",
  "not-permitted",
]);

export function refuseVerification<T>(
  action: string,
  result: Result<T, VerificationErrorDetails>,
): Result<T, VerificationActionDetails> {
  if (result.ok) return result;
  if (HERS.has(result.error.details?.reason ?? "")) return result;
  log.error("verification action refused", {
    module: "verification",
    action,
    code: result.error.code,
    reason: result.error.details?.reason ?? null,
  });
  return err(
    "INTERNAL",
    "We couldn't save that just now. Try again in a moment.",
    {
      reason: result.error.details?.reason ?? "store-failed",
    },
  );
}
