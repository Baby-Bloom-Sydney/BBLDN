// Boot hook: installs `createRateLimiter({ store, log, burstAlertMultiple })` and **declares what it counts in**.
// `backend` defaults to `"memory"` so a boot that forgets to say keeps failing closed in production (07 §8);
// the shared `rate_limit_buckets` store (S5) is installed as `configureRateLimiter(limiter, "shared")`.
import type { RateLimitBackend, RateLimiter } from "../types";
import { RATE_LIMIT_BACKEND_REGISTRY } from "./rate-limit-backend-registry";
import { RATE_LIMITER_REGISTRY } from "./rate-limiter-registry";

export function configureRateLimiter(
  limiter: RateLimiter,
  backend: RateLimitBackend = "memory",
): void {
  RATE_LIMITER_REGISTRY.set(limiter);
  RATE_LIMIT_BACKEND_REGISTRY.set(backend);
}
