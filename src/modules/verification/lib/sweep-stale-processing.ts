// I-V4's named job (ADR-157 (5); ADR-161): a section a provider never answered is handed to a person after
// `VETTING.staleProcessingMinutes`, so nothing waits in limbo. Hosted by the 5-minute run at service scope; no
// session, no level move (processing → review is not verified either way).
import { VETTING } from "@/modules/config";
import { ok } from "@/modules/platform";
import type { Instant, Result } from "@/modules/shared-types";
import type {
  SweepResult,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";

export async function sweepStaleProcessing(
  deps: VerificationDeps,
  now: Instant,
): Promise<Result<SweepResult, VerificationErrorDetails>> {
  const swept = await deps.store.sweepStale(
    VETTING.staleProcessingMinutes,
    now,
  );
  if (!swept.ok) return swept;
  return ok({ handled: swept.value, skipped: 0 });
}
