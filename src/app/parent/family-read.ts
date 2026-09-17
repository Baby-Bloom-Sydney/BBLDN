// ★ M-15 (REVIEW-2) — **"signed out" and "we could not tell" are different answers, at the top of the page too.**
//
// S-P-03 read the session as `signedInUserId.ok && signedInUserId.value !== null ? … : null`, which folded a
// *failed* auth read into the same `null` as a genuinely signed-out visitor: the gate below was skipped
// entirely and the logged-out page rendered, with no log anywhere. The gate itself is handled correctly and
// says so in a comment (`1h`'s three-valued `hasAccess`); the read above it was not. This is the same finding
// the `app-gate` suite exists to stop coming back, one layer higher up.
//
// It is a pure function over the `Result` so the distinction is testable without standing a route up.
import { log } from "@/modules/platform";
import type { FamilyId, Result, UserId } from "@/modules/shared-types";

export type FamilyRead =
  | { readonly kind: "family"; readonly familyId: FamilyId }
  | { readonly kind: "signed-out" }
  | { readonly kind: "unavailable" };

export function familyRead(read: Result<UserId | null>): FamilyRead {
  if (read.ok)
    return read.value === null
      ? { kind: "signed-out" }
      : { kind: "family", familyId: read.value as string as FamilyId };
  log.error("parent hub: the session read did not answer", {
    module: "app",
    action: "ParentHubPage",
    alert: "ALERT_PROVIDER_DOWN",
    surface: "S-P-03",
    reason: read.error.details?.reason ?? read.error.code,
  });
  return { kind: "unavailable" };
}
