// The boot slot for the module-level `rateLimiter`. The default runs on the memory store (per instance — the
// dev implementation); production boot installs one over the shared `rate_limit_buckets` store (07 §8).
import { SECURITY } from "@/modules/config";
import type { RateLimiter } from "../types";
import { createRegistry } from "../../lib/create-registry";
import { log } from "../../log/lib/default-log";
import { createRateLimiter } from "./create-rate-limiter";
import { memoryRateLimitStore } from "./memory-rate-limit-store";

export const RATE_LIMITER_REGISTRY = createRegistry<RateLimiter>(
  createRateLimiter({
    store: memoryRateLimitStore(),
    log,
    burstAlertMultiple: SECURITY.burstAlertMultiple,
  }),
);
