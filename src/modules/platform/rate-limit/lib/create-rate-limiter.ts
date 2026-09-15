// 07 §8 `consume(key, policy)`: every window of the policy is counted, tightest first; the first one over its
// limit is the hit — `RATE_LIMITED { window, retryAfterSeconds }` (01 §4c rule 5). A key that trips
// `burstAlertMultiple` times in an hour logs `ALERT_RATE_LIMIT_BURST` once (the key itself is never logged). A
// store failure denies — fail closed — and is logged `error`.
import type { Instant, Result } from "@/modules/shared-types";
import type {
  RateLimitAllowance,
  RateLimitDetails,
  RateLimitPolicy,
  RateLimiter,
  RateLimiterDeps,
} from "../types";
import { err } from "../../lib/err";
import { nowInstant } from "../../lib/now-instant";
import { ok } from "../../lib/ok";
import { policyWindows } from "./policy-windows";

const BURST_WINDOW_SECONDS = 3600;
const secondsUntil = (resetAt: Instant, now: Instant): number =>
  Math.max(1, Math.ceil((Date.parse(resetAt) - Date.parse(now)) / 1000));

async function noteBurst(
  key: string,
  policy: RateLimitPolicy,
  now: Instant,
  deps: RateLimiterDeps,
): Promise<void> {
  const trips = await deps.store.increment(
    `burst:${policy.key}:${key}`,
    BURST_WINDOW_SECONDS,
    now,
  );
  if (trips.ok && trips.value.count === deps.burstAlertMultiple) {
    deps.log?.warn("rate limit burst", {
      alert: "ALERT_RATE_LIMIT_BURST",
      policy: policy.key,
      trips: trips.value.count,
      windowSeconds: BURST_WINDOW_SECONDS,
    });
  }
}

async function consume(
  key: string,
  policy: RateLimitPolicy,
  deps: RateLimiterDeps,
): Promise<Result<RateLimitAllowance, RateLimitDetails>> {
  const now = (deps.clock ?? nowInstant)();
  const allowances: RateLimitAllowance[] = [];
  for (const { window, seconds, limit } of policyWindows(policy)) {
    const counted = await deps.store.increment(
      `${policy.key}:${key}:${window}`,
      seconds,
      now,
    );
    if (!counted.ok) {
      deps.log?.error("rate limit store failed — denying", {
        policy: policy.key,
        window,
        errorCode: counted.error.code,
        cause: counted.error.cause,
      });
      return err(
        "INTERNAL",
        "Rate limit unavailable",
        undefined,
        counted.error,
      ) as Result<RateLimitAllowance, RateLimitDetails>;
    }
    if (counted.value.count > limit) {
      await noteBurst(key, policy, now, deps);
      return err("RATE_LIMITED", "Too many requests", {
        reason: "limit",
        window,
        retryAfterSeconds: secondsUntil(counted.value.resetAt, now),
      });
    }
    allowances.push({
      remaining: limit - counted.value.count,
      resetAt: counted.value.resetAt,
    });
  }
  const tightest = allowances.reduce(
    (best, next) => (next.remaining < best.remaining ? next : best),
    allowances[0] ?? { remaining: Number.POSITIVE_INFINITY, resetAt: now },
  );
  return ok(Object.freeze(tightest));
}

export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  return Object.freeze({
    consume: (key, policy) => consume(key, policy, deps),
  });
}
