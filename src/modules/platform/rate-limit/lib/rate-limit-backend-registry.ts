// What the installed limiter is actually counting in. The `RateLimiter` contract exposes no discriminant — by
// design, a caller must not care — so the boot code *declares* it through `configureRateLimiter(limiter, backend)`
// and this slot remembers the declaration. Default `"memory"`: a deployment that never declares a shared store is
// treated as not having one (fail closed), which is the whole point of `assertSharedStore`.
import type { RateLimitBackend } from "../types";
import { createRegistry } from "../../lib/create-registry";

export const RATE_LIMIT_BACKEND_REGISTRY =
  createRegistry<RateLimitBackend>("memory");
