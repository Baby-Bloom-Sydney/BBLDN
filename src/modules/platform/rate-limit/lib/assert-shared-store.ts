// 07 §8 — the identity layer is a *shared* Postgres token bucket. The module starts on the per-instance memory
// store, which is correct for a laptop and wrong for production: N instances × the limit, silently. This is the
// assertion that the boot code (`src/instrumentation.ts`, S4 / F-c) installed a shared-store limiter before the
// first request. It fails closed — a limit that cannot be enforced denies rather than waves the caller through —
// and raises `ALERT_ENV_INVALID`, the same hook the env guard uses for "the deployment is misconfigured".
//
// The shared store itself is a later unit (the `rate_limit_buckets` table is S5); this only makes its absence loud.
import type { Result } from "@/modules/shared-types";
import type { Log } from "../../log/types";
import type {
  RateLimitAllowance,
  RateLimitDetails,
  RateLimiter,
} from "../types";
import { err } from "../../lib/err";
import { log as defaultLog } from "../../log/lib/default-log";
import { MEMORY_BACKED_RATE_LIMITER } from "./memory-backed-rate-limiter";

const MESSAGE = "Rate limit unavailable";

/** `null` when the limiter may run; a denial when production is still on the per-instance default. */
export function assertSharedStore(
  limiter: RateLimiter,
  isProduction: boolean,
  logger: Log = defaultLog,
): Result<RateLimitAllowance, RateLimitDetails> | null {
  if (!isProduction || limiter !== MEMORY_BACKED_RATE_LIMITER) return null;
  logger.error("rate limiter has no shared store in production — denying", {
    alert: "ALERT_ENV_INVALID",
    module: "platform",
    action: "rate-limit.consume",
  });
  return err("INTERNAL", MESSAGE, undefined, {
    reason: "rate-limit-store-not-configured",
  }) as Result<RateLimitAllowance, RateLimitDetails>;
}
