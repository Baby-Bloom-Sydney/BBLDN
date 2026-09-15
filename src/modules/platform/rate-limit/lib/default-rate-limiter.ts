// 07 §8 `platform/rate-limit.consume(key, policy)` — the limiter routes and actions import. Every call passes
// through `assertSharedStore` first: in production, a deployment that never declared a shared store denies
// (fail closed) instead of enforcing a limit N times over, once per instance.
import { publicEnv } from "@/modules/config";
import type { RateLimiter } from "../types";
import { assertSharedStore } from "./assert-shared-store";
import { RATE_LIMIT_BACKEND_REGISTRY } from "./rate-limit-backend-registry";
import { RATE_LIMITER_REGISTRY } from "./rate-limiter-registry";

export const rateLimiter: RateLimiter = Object.freeze({
  consume: async (key, policy) => {
    const unconfigured = assertSharedStore(
      RATE_LIMIT_BACKEND_REGISTRY.get(),
      publicEnv.NODE_ENV === "production",
    );
    return unconfigured ?? RATE_LIMITER_REGISTRY.get().consume(key, policy);
  },
});
