// 07 §8 — the identity layer is a *shared* Postgres token bucket. The module starts on the per-instance memory
// store, which is right for a laptop and wrong for production: N instances × the limit, silently. This asserts
// that the boot code (`src/instrumentation.ts`, S4 / F-c) declared a shared-store limiter before the first
// request. It fails closed — a limit that cannot be enforced denies rather than waving the caller through — and
// raises `ALERT_ENV_INVALID`, the hook the env guard already uses for "this deployment is misconfigured".
//
// `isProductionRuntime` is `NODE_ENV === "production"`, the only production signal a client-safe leaf can read
// (01 §3.3's `resolveEnvironment` is `server-only`). On Vercel that is true for **preview as well as production**
// — deliberately: a preview deployment that shares a database should share a rate-limit store too, and a guard
// that only fires in production is a guard first exercised in production. The cost is that the first route wired
// to `consume` will deny on preview until boot declares a backend, which is the intended prompt, not a surprise.
//
// It keys on the **declared** backend (`configureRateLimiter(limiter, "shared")`), not on the identity of the
// default limiter: a second memory-backed limiter installed at boot is exactly the failure this must catch, and
// an identity check would wave it through. The shared store itself is a later unit (the `rate_limit_buckets`
// table is S5); this only makes its absence loud.
import type { Result } from "@/modules/shared-types";
import type { Log } from "../../log/types";
import type {
  RateLimitAllowance,
  RateLimitBackend,
  RateLimitDetails,
} from "../types";
import { err } from "../../lib/err";
import { log as defaultLog } from "../../log/lib/default-log";

const MESSAGE = "Rate limit unavailable";

/** `null` when the limiter may run; a denial when production has not declared a shared store. */
export function assertSharedStore(
  backend: RateLimitBackend,
  isProductionRuntime: boolean,
  logger: Log = defaultLog,
): Result<RateLimitAllowance, RateLimitDetails> | null {
  if (!isProductionRuntime || backend === "shared") return null;
  logger.error("rate limiter has no shared store in production — denying", {
    alert: "ALERT_ENV_INVALID",
    module: "platform",
    action: "rate-limit.consume",
    reason: "rate-limit-store-not-configured",
    backend,
  });
  return err<RateLimitDetails>("INTERNAL", MESSAGE);
}
