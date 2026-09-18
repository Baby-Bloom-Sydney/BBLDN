// Whether a section takes a new submission: `not_started` and the sent-back states do; `pending`, `processing`
// and `review` are already with us (already-submitted); `verified` is closed. The identity attempts cap
// (07 §8 row 11; `VETTING.attemptsCap`) is judged here too.
import { VETTING } from "@/modules/config";
import { err, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { SectionState, VerificationErrorDetails } from "../types";

const WITH_US = new Set(["pending", "processing", "review"]);

export function assertSectionOpen(
  section: SectionState,
): Result<void, VerificationErrorDetails> {
  if (WITH_US.has(section.status))
    return err("CONFLICT", "We already have this — a person is reviewing it.", {
      reason: "already-submitted",
    });
  if (section.status === "verified")
    return err("CONFLICT", "This part is already confirmed.", {
      reason: "section-not-open",
    });
  if ((section.attempts ?? 0) >= VETTING.attemptsCap)
    return err(
      "CONFLICT",
      "You've tried this a few times — a person will review it.",
      {
        reason: "too-many-attempts",
      },
    );
  return ok(undefined);
}
