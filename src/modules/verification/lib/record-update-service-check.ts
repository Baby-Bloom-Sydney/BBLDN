// The level-4 action (04 §4.1 row 15; ADR-157 (3)): the admin records what the Update Service said about the
// certificate, named by its DBS submission — the nanny is read from the ledger, never a form field. `checkedBy` is the SESSION's admin, written as the audit trail (07 §5.4 row 6) — the definer refuses
// any id that is not an admin's. Only `no_change` confirms L4 (the B-19 default); `new_information` sends the
// section back to review and the level with it. `adminRoutes` consumed; the events and the approval follow.
import { err, nowInstant } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import { readSubmission } from "@/modules/vetting-providers";
import type {
  LevelSync,
  UpdateServiceInput,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { consumeAdminRouteLimit } from "./consume-admin-route-limit";
import { emitLevelEvents } from "./emit-level-events";
import { requireAdmin } from "./require-admin";
import { sendVerificationOutcome } from "./send-verification-outcome";

export async function recordUpdateServiceCheck(
  deps: VerificationDeps,
  input: UpdateServiceInput,
): Promise<Result<LevelSync, VerificationErrorDetails>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const limited = await consumeAdminRouteLimit(admin.value);
  if (!limited.ok) return limited;
  // the subject is the submission's nanny (ADR-159; security pass LOW-1) — and it must be a DBS submission
  const entry = await readSubmission(input.submissionId);
  if (!entry.ok) return entry as Result<never, VerificationErrorDetails>;
  if (entry.value === null || entry.value.section !== "dbs")
    return err("VALIDATION", "That check is not available", {
      reason: "unsupported-evidence",
    });
  const nannyId = entry.value.nannyId;
  const synced = await deps.store.recordUpdateServiceCheck({
    nannyId,
    result: input.result,
    subscribed: input.subscribed,
    checkedBy: admin.value.userId,
  });
  if (!synced.ok) return synced;
  await emitLevelEvents(nannyId, synced.value);
  await sendVerificationOutcome({
    nannyId,
    sync: synced.value,
    now: nowInstant(),
  });
  return synced;
}
