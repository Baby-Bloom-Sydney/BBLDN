// The level-4 action (04 §4.1 row 15; ADR-157 (3)): the admin records what the Update Service said about the
// certificate. `checkedBy` is the SESSION's admin, written as the audit trail (07 §5.4 row 6) — the definer refuses
// any id that is not an admin's. Only `no_change` confirms L4 (the B-19 default); `new_information` sends the
// section back to review and the level with it. `adminRoutes` consumed; the events and the approval follow.
import { nowInstant } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
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
  const synced = await deps.store.recordUpdateServiceCheck({
    ...input,
    checkedBy: admin.value.userId,
  });
  if (!synced.ok) return synced;
  await emitLevelEvents(input.nannyId, synced.value);
  await sendVerificationOutcome({
    nannyId: input.nannyId,
    sync: synced.value,
    now: nowInstant(),
  });
  return synced;
}
