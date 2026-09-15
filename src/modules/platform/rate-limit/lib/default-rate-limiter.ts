// 07 §8 `platform/rate-limit.consume(key, policy)` — the limiter routes and actions import.
import type { RateLimiter } from "../types";
import { RATE_LIMITER_REGISTRY } from "./rate-limiter-registry";

export const rateLimiter: RateLimiter = Object.freeze({
  consume: (key, policy) => RATE_LIMITER_REGISTRY.get().consume(key, policy),
});
