// 07 §8 `platform/rate-limit.consume(key, policy)` — the limiter routes and actions import. Every call passes
// through `assertSharedStore` first: in production, a limiter still backed by the per-instance memory store
// denies (fail closed) instead of enforcing a limit N times over.
import { publicEnv } from "@/modules/config";
import type { RateLimiter } from "../types";
import { assertSharedStore } from "./assert-shared-store";
import { RATE_LIMITER_REGISTRY } from "./rate-limiter-registry";

export const rateLimiter: RateLimiter = Object.freeze({
  consume: async (key, policy) => {
    const current = RATE_LIMITER_REGISTRY.get();
    const unconfigured = assertSharedStore(
      current,
      publicEnv.NODE_ENV === "production",
    );
    return unconfigured ?? current.consume(key, policy);
  },
});
