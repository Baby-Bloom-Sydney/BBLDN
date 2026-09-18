// ★ ADR-168 (b) — **lifting a bar is its own act.**
//
// REVIEW-4 C-2 measured a bar coming off as a side effect: re-deciding the same submission with `mismatch` took
// `suspended_at` from `t` to `f`, on the screen whose purpose is recording a decision, with nothing anywhere
// saying a bar had been lifted. `0025` removed that road from the derivation entirely. This is the road that
// replaces it, and it has the same shape as every other authority write on this module:
//
//   1. **authority from the session** — `requireAdmin` (`aal2`, 07 §5.4 rows 1–2), before anything is read;
//   2. **the budget** — `adminRoutes` consumed before the first read, as `decide` and `openEvidence` do
//      (REVIEW-3 security M-4: role first, budget second, work third, on all three admin roads — four now);
//   3. **the subject from the SUBMISSION**, never a form field (ADR-145's pattern; ADR-159) — the queue row the
//      admin is looking at names the nanny, and `parse-lift-form` cannot carry an identity;
//   4. **the reason**, hers, non-blank on both sides: refused here for the message the form can show, and
//      refused again inside the definer so no other caller can write a blank one;
//   5. **the audit row**, written inside the definer in the same transaction as the columns it describes;
//   6. **its own comms** — she is told, and the admin mailbox is told, because a lift is as notifiable as the
//      bar was.
//
// It writes no level: ADR-157 (1) keeps `sync_nanny_verification_state()` the one writer of that, and after a
// lift she sits where I-V5 left her until her next decision re-derives it. That errs low, never high.
import { err, log } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import { readSubmission } from "@/modules/vetting-providers";
import type {
  LiftSuspensionInput,
  SuspensionLift,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { consumeAdminRouteLimit } from "./consume-admin-route-limit";
import { requireAdmin } from "./require-admin";
import { sendSuspensionLifted } from "./send-suspension-lifted";

export async function liftSuspension(
  deps: VerificationDeps,
  input: LiftSuspensionInput,
): Promise<Result<SuspensionLift, VerificationErrorDetails>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const limited = await consumeAdminRouteLimit(admin.value);
  if (!limited.ok) return limited;

  const reason = input.reason.trim();
  if (reason === "")
    return err("VALIDATION", "Say why the suspension is being lifted.", {
      reason: "reason-required",
      field: "reason",
    });

  const entry = await readSubmission(input.submissionId);
  if (!entry.ok) return entry as Result<never, VerificationErrorDetails>;
  if (entry.value === null)
    return err("VALIDATION", "That check is not available", {
      reason: "unsupported-evidence",
    });

  // ADR-169: the write is keyed by the party row the ledger carries; her email is keyed by the session id the
  // record carries. One crossing, here.
  const record = await deps.store.readAdminRecord(entry.value.nannyId);
  if (!record.ok) return record;
  if (record.value === null)
    return err("VALIDATION", "That check is not available", {
      reason: "unsupported-evidence",
    });

  const lifted = await deps.store.liftSuspension({
    nannyId: entry.value.nannyId,
    reason,
    decidedBy: admin.value.userId,
  });
  if (!lifted.ok) {
    log.warn("suspension lift refused", {
      module: "verification",
      action: "liftSuspension",
      reason: lifted.error.details?.reason ?? lifted.error.code,
    });
    return lifted;
  }

  await sendSuspensionLifted(record.value.userId);
  return lifted;
}
