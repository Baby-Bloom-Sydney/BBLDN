// platform/rate-limit — the identity-layer limiter of 07 §8 (`platform/rate-limit.consume(key, policy)`): limits
// are `config/security.ts` values, hits are `RATE_LIMITED` / 429 with `Retry-After` (01 §4c rule 5). The edge
// layer (Vercel Firewall) is not code. The store behind it is the `rate_limit_buckets` table (S5 / F-c);
// `memoryRateLimitStore` is the stub and the dev implementation.
import type { RateLimit } from "@/modules/config";
import type { Instant, Result } from "@/modules/shared-types";
import type { Log } from "../log/types";

export type RateLimitPolicy = RateLimit;
export type RateLimitWindow = "minute" | "hour" | "day";

export type RateLimitAllowance = {
  /** the smallest remaining count across the policy's windows */
  readonly remaining: number;
  /** when the tightest window resets */
  readonly resetAt: Instant;
};

/** `details` of a `RATE_LIMITED` result. */
export type RateLimitDetails = {
  readonly reason: "limit";
  readonly window: RateLimitWindow;
  readonly retryAfterSeconds: number;
};

export type RateLimiter = {
  /**
   * `key` is the caller-derived identity (user id, IP + UA hash, email hash, token — never the consent-gated
   * `visitor_id`, 07 §2.9 / §8 row 4); `policy` a `SECURITY.rateLimits.*` value.
   */
  consume(
    key: string,
    policy: RateLimitPolicy,
  ): Promise<Result<RateLimitAllowance, RateLimitDetails>>;
};

export type BucketState = {
  readonly count: number;
  readonly resetAt: Instant;
};

/** The token-bucket port: one counter per `(bucket, window)` that resets when the window ends. */
export type RateLimitStore = {
  increment(
    bucket: string,
    windowSeconds: number,
    now: Instant,
  ): Promise<Result<BucketState>>;
};

export type PolicyWindow = {
  readonly window: RateLimitWindow;
  readonly seconds: number;
  readonly limit: number;
};

export type RateLimiterDeps = {
  readonly store: RateLimitStore;
  readonly clock?: () => Instant;
  readonly log?: Log;
  /** `SECURITY.burstAlertMultiple`: a key that trips ≥ this many times in an hour logs `ALERT_RATE_LIMIT_BURST` */
  readonly burstAlertMultiple: number;
};
