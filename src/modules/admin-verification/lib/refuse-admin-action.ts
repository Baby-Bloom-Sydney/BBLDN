// The one refusal shape the three actions answer (01 §4a): a reason the panel can act on passes through
// (`not-permitted` → sign in, `reason-required` → the reason field, `unsupported-evidence` → the row is gone);
// anything else is logged server-side and the form gets the generic line — never a store or provider detail.
import { err, log, toActionResult } from "@/modules/platform";
import type { ClientResult } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { VerificationErrorDetails } from "@/modules/verification";
import type { ActionDetails } from "../types";

const THEIRS: ReadonlySet<string> = new Set([
  "not-permitted",
  "reason-required",
  "unsupported-evidence",
  "invalid-input",
]);

export function refuseAdminAction<T>(
  action: string,
  result: Result<T, VerificationErrorDetails>,
): ClientResult<T, ActionDetails> {
  if (result.ok) return toActionResult(result);
  if (THEIRS.has(result.error.details?.reason ?? ""))
    return toActionResult(result as Result<T, ActionDetails>);
  log.error("admin verification action refused", {
    module: "admin-verification",
    action,
    code: result.error.code,
    reason: result.error.details?.reason ?? null,
  });
  return toActionResult(
    err<ActionDetails>(
      "INTERNAL",
      "That could not be recorded just now. Try again in a moment.",
      {
        reason: "store-failed",
      },
    ),
  );
}
