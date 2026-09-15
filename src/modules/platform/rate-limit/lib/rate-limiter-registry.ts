// The boot slot for the module-level `rateLimiter`. The default runs on the memory store (per instance — the
// dev implementation); production boot installs one over the shared `rate_limit_buckets` store (07 §8), and
// `assertSharedStore` denies until it has.
import type { RateLimiter } from "../types";
import { createRegistry } from "../../lib/create-registry";
import { MEMORY_BACKED_RATE_LIMITER } from "./memory-backed-rate-limiter";

export const RATE_LIMITER_REGISTRY = createRegistry<RateLimiter>(
  MEMORY_BACKED_RATE_LIMITER,
);
