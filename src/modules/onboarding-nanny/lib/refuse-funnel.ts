// The one INTERNAL refusal the funnel's actions answer (01 §4a): the reason is logged server-side with the step
// that refused, and the form gets the generic line — the same line for an outage, a throttle and a store that is
// not configured, so nothing about the refusal can be read as a fact about the address (ADR-132).
import { err, log } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { NannyFunnelErrorDetails } from "../types";

export function refuseFunnel(
  action: string,
  step: string,
  cause: unknown,
): Result<never, NannyFunnelErrorDetails> {
  log.error("nanny funnel refused", { module: "onboarding-nanny", action, step, cause });
  return err("INTERNAL", "We couldn't save that just now. Try again in a moment.");
}
