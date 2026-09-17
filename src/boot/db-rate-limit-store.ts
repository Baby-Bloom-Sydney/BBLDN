// The `RateLimitStore` of `platform/rate-limit` (07 §8) over `auth`'s data port — the shared `rate_limit_buckets`
// table of `0017`. **This is what makes a limit a limit.** Until it existed the only store was per instance, so
// N serverless instances allowed N × the configured limit and `assertSharedStore` (correctly) denied every
// `consume` in a production-resolved environment rather than let the boot pretend otherwise.
//
// One RPC, not a read then a write: `consume_rate_limit` does the read, the window roll and the increment in one
// statement, because a read-then-write from a client undercounts under exactly the concurrency a limiter is for
// (ADR-127). Service scope — the table carries no client policy at all (07 §5.2), and the call is a named
// service-role use in `auth`'s README (07 §5.1 rule 5).
//
// The bucket key never reaches a log line: it is already a hash (a user id, an IP + UA hash, an email hash or a
// token — never the consent-gated `visitor_id`, 07 §2.9 / §8 row 4), and the port's audit line carries the
// operation name only.
import type { DataAccessPort } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type { BucketState, RateLimitStore } from "@/modules/platform";
import type { Instant, Result } from "@/modules/shared-types";

const EMPTY_ROW = err("INTERNAL", "The rate limiter did not answer", {
  reason: "rate-limit-store-empty",
});

export function dbRateLimitStore(port: DataAccessPort): RateLimitStore {
  return Object.freeze({
    increment: async (
      bucket: string,
      windowSeconds: number,
      now: Instant,
    ): Promise<Result<BucketState>> => {
      const rows = await port.run(
        {
          name: "platform.rate-limit.consume",
          exec: (q) =>
            q.rpc("consume_rate_limit", {
              p_bucket: bucket,
              p_window_seconds: windowSeconds,
              p_now: now,
            }),
        },
        { scope: "service" },
      );
      if (!rows.ok) return rows;
      // `returns table (...)` arrives as an array; one row is the only shape the function can produce.
      const row = rows.value[0];
      if (row === undefined) return EMPTY_ROW;
      return ok(
        Object.freeze({ count: row.count, resetAt: row.reset_at as Instant }),
      );
    },
  });
}
