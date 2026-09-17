// The rate limiter (07 §8) over the shared `rate_limit_buckets` store of `0017` (ADR-131 (3)).
//
// `configureRateLimiter(limiter, "shared")` is a **claim**, and `assertSharedStore` is what makes it cost
// something: until `0017` there was no shared store to claim, so P1-WIRE left the port on its per-instance
// default and every `consume` denied in a production-resolved environment — the honest answer, because declaring
// the memory store "shared" would have meant N instances × the configured limit, silently, which is the exact
// failure the assertion exists to catch. The table now exists, so the claim is true and is made here.
//
// Outside a production-resolved environment the module default (per-instance memory) is left alone: a developer
// should not need a reachable database to be rate-limited, and `assertSharedStore` does not ask them to be.
import { auth } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import type { Environment } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  log,
} from "@/modules/platform";
import { dbRateLimitStore } from "./db-rate-limit-store";
import type { PortWiring } from "./types";

const SHARED_REASON =
  "rate_limit_buckets (0017) is the shared store 07 §8 names, so every limit is one limit across every instance; consume_rate_limit does the read, the window roll and the increment in one statement (ADR-127)";
const MEMORY_REASON =
  "per-instance memory store: outside a production-resolved environment assertSharedStore does not require a shared store, and a developer should not need a reachable database to be rate-limited";

export function wireRateLimiter(environment: Environment): PortWiring {
  if (environment === "development") {
    log.info("boot: rate limiter left on the per-instance memory store", {
      action: "boot",
      module: "platform",
      reason: "rate-limit-store-memory-by-environment",
    });
    return {
      port: "rate-limit",
      binding: "memory (module default)",
      reason: MEMORY_REASON,
    };
  }

  configureRateLimiter(
    createRateLimiter({
      store: dbRateLimitStore(auth.data),
      log,
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
    "shared",
  );
  return {
    port: "rate-limit",
    binding: "db-rate-limit (rate_limit_buckets, service scope)",
    reason: SHARED_REASON,
  };
}
