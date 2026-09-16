// The rate limiter (07 §8) is **not** declared shared, on purpose. `configureRateLimiter(limiter, "shared")` is
// what stops `assertSharedStore` denying every `consume` in a production-resolved environment (preview
// included) — but the shared store is the `rate_limit_buckets` table, and that table has no specification:
// 07 §8 names it, 02 §4 / §6 never create it, S5 did not invent its columns. Declaring the per-instance memory
// store "shared" would be exactly the failure the assertion exists to catch (N instances × the limit, silently),
// so the port stays on its default and the gap is said out loud here, once per boot.
import { log } from "@/modules/platform";
import type { PortWiring } from "./types";

const REASON =
  "rate_limit_buckets has no specification (07 §8 names it; 02 §4/§6 never create it) — the memory store is not declared shared, so consume denies in production-resolved environments until the table and its store exist";

export function wireRateLimiter(): PortWiring {
  log.warn("boot: rate limiter has no shared store", {
    action: "boot",
    module: "platform",
    reason: "rate-limit-store-not-configured",
  });
  return {
    port: "rate-limit",
    binding: "memory (module default)",
    reason: REASON,
  };
}
