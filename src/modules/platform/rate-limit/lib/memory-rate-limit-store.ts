// The token-bucket store in memory: one counter per bucket that resets when its window ends. The dev store and
// the stub; per instance — the shared `rate_limit_buckets` table (07 §8) replaces it at boot.
import type { Instant } from "@/modules/shared-types";
import type { BucketState, RateLimitStore } from "../types";
import { ok } from "../../lib/ok";

const addSeconds = (at: Instant, seconds: number): Instant =>
  new Date(Date.parse(at) + seconds * 1000).toISOString() as Instant;

export function memoryRateLimitStore(): RateLimitStore {
  const buckets = new Map<string, BucketState>();
  return Object.freeze({
    increment: async (bucket, windowSeconds, now) => {
      const current = buckets.get(bucket);
      const next: BucketState =
        current === undefined || current.resetAt <= now
          ? Object.freeze({ count: 1, resetAt: addSeconds(now, windowSeconds) })
          : Object.freeze({
              count: current.count + 1,
              resetAt: current.resetAt,
            });
      buckets.set(bucket, next);
      return ok(next);
    },
  });
}
