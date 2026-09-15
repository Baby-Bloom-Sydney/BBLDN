// A `config/security.ts` policy → its windows, tightest first (minute · hour · day), each with its limit.
import type { PolicyWindow, RateLimitPolicy, RateLimitWindow } from "../types";

const SECONDS: Readonly<Record<RateLimitWindow, number>> = Object.freeze({
  minute: 60,
  hour: 3600,
  day: 86400,
});

export function policyWindows(
  policy: RateLimitPolicy,
): ReadonlyArray<PolicyWindow> {
  const candidates: ReadonlyArray<
    readonly [RateLimitWindow, number | undefined]
  > = [
    ["minute", policy.perMinute],
    ["hour", policy.perHour],
    ["day", policy.perDay],
  ];
  return candidates.flatMap(([window, limit]) =>
    limit === undefined ? [] : [{ window, seconds: SECONDS[window], limit }],
  );
}
