// platform/rate-limit connector (07 §8) — `rateLimiter.consume(key, policy)` over `SECURITY.rateLimits`;
// `memoryRateLimitStore` is the stub and the per-instance dev store; the shared `rate_limit_buckets` store
// (07 §8; S5 table) is injected at boot through `configureRateLimiter`.
export type * from "./types";
export { policyWindows } from "./lib/policy-windows";
export { createRateLimiter } from "./lib/create-rate-limiter";
export { memoryRateLimitStore } from "./lib/memory-rate-limit-store";
export { rateLimiter } from "./lib/default-rate-limiter";
export { configureRateLimiter } from "./lib/configure-rate-limiter";
