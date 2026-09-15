// Boot hook: installs `createRateLimiter({ store, log, burstAlertMultiple })` over the shared store.
import type { RateLimiter } from "../types";
import { RATE_LIMITER_REGISTRY } from "./rate-limiter-registry";

export function configureRateLimiter(limiter: RateLimiter): void {
  RATE_LIMITER_REGISTRY.set(limiter);
}
