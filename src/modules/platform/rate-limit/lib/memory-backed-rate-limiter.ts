// The limiter the module starts with: `createRateLimiter` over the per-instance memory store. It is the dev
// implementation and the stub — named here, rather than built inline in the registry, so `assertSharedStore` can
// tell by identity whether the registry still holds it or the boot code installed a shared-store limiter over it
// (07 §8; the shared `rate_limit_buckets` store is S5 / F-c).
import { SECURITY } from "@/modules/config";
import type { RateLimiter } from "../types";
import { log } from "../../log/lib/default-log";
import { createRateLimiter } from "./create-rate-limiter";
import { memoryRateLimitStore } from "./memory-rate-limit-store";

export const MEMORY_BACKED_RATE_LIMITER: RateLimiter = createRateLimiter({
  store: memoryRateLimitStore(),
  log,
  burstAlertMultiple: SECURITY.burstAlertMultiple,
  failOpenOnLimiterOutage: SECURITY.failOpenOnLimiterOutage,
});
