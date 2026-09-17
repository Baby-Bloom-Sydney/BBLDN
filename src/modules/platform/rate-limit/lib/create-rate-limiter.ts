// 07 §8 `consume(key, policy)`: every window of the policy is counted, tightest first; the first one over its
// limit is the hit — `RATE_LIMITED { window, retryAfterSeconds }` (01 §4c rule 5). A key that trips
// `burstAlertMultiple` times in an hour logs `ALERT_RATE_LIMIT_BURST` (at or past the multiple, so a lost
// increment cannot disarm it — M-14; the key itself is never logged, and a failing burst counter is logged). A
// store failure denies — fail closed — and is logged `error`, **unless** the policy is named on the injected
// `SECURITY.failOpenOnLimiterOutage` allow-list (ADR-134 / ADR-140), in which case the call proceeds and the
// outage raises `ALERT_PROVIDER_DOWN`. That decision is taken here, by declared policy name, and nowhere else.
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
const after = (now: Instant, seconds: number): Instant =>
  new Date(Date.parse(now) + seconds * 1000).toISOString() as Instant;

/**
 * ADR-134 / ADR-140 — **the one place fail-open is decided.** Membership is by the policy's declared name, from
 * the allow-list this limiter was built with (`SECURITY.failOpenOnLimiterOutage`); a policy that carries no name
 * — one built anywhere but `config/security.ts` — is never on it. No caller can acquire the property by
 * importing a helper, which is the state ADR-134 forbids and REVIEW-2 found (M-2).
 */
function failsOpen(policy: RateLimitPolicy, deps: RateLimiterDeps): boolean {
  const name = policy.name;
  if (name === undefined) return false;
  return (deps.failOpenOnLimiterOutage ?? []).includes(name);
}

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
  // M-14: the counter that arms the alert can fail like any other bucket, and a swallowed failure means
  // `ALERT_RATE_LIMIT_BURST` never fires for this key and nobody knows. The refusal itself already stands — this
  // is only the alert — so the failure is logged rather than raised. The key is never logged (07 §8).
  if (!trips.ok) {
    deps.log?.error("rate limit: the burst counter did not answer", {
      policy: policy.key,
      reason: "burst-count-failed",
      errorCode: trips.error.code,
      windowSeconds: BURST_WINDOW_SECONDS,
    });
    return;
  }
  // `>=`, never `===`: one increment the store never returned would otherwise step the count past the multiple
  // and disarm the alert for that key for the rest of the hour (M-14).
  if (trips.value.count >= deps.burstAlertMultiple) {
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
      if (failsOpen(policy, deps)) {
        // ADR-134 / ADR-140: this policy is on `SECURITY.failOpenOnLimiterOutage`, so the caller continues and
        // the outage is the alert. The key is never logged (07 §8) — only the policy and the reason, which is
        // what the runbook acts on.
        deps.log?.error(
          "rate limit store failed — the call proceeds (fail-open allow-list)",
          {
            alert: "ALERT_PROVIDER_DOWN",
            policy: policy.key,
            window,
            errorCode: counted.error.code,
          },
        );
        return ok(
          Object.freeze({ remaining: limit, resetAt: after(now, seconds) }),
        );
      }
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
