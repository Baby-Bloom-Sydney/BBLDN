// 07 §8 row 1 on `/api/areas` — the combobox's source is unauthenticated reference data, so the only thing
// standing between it and a scraper is this limit and the edge rule in front of it.
//
// The limiter is installed here over the **memory** store: what is under test is the route's behaviour once a
// policy is exceeded (429, `Retry-After`, no work done), not the store — `rate_limit_buckets` and the RPC that
// counts into it are proved against the applied schema in `supabase/__tests__/constraints.test.ts` and against
// the port seam in `src/boot/__tests__/db-0017-stores.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureAreas, stubAreas } from "@/modules/areas";
import { SECURITY } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  memoryRateLimitStore,
} from "@/modules/platform";
import { GET } from "./route";

const CALLER = { "x-forwarded-for": "203.0.113.7" };
const OTHER_CALLER = { "x-forwarded-for": "198.51.100.4" };

const get = (headers: Readonly<Record<string, string>>) =>
  new Request("https://example.test/api/areas", { method: "GET", headers });

/** The policy's tightest window, so "a burst" means the smallest number of calls that can trip it. */
const PER_MINUTE = SECURITY.rateLimits.publicRead.perMinute ?? 0;

beforeEach(() => {
  configureAreas(stubAreas());
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
    "shared",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/areas — 07 §8 row 1", () => {
  it("answers 200 inside the limit", async () => {
    const response = await GET(get(CALLER));
    expect(response.status).toBe(200);
  });

  it("refuses a burst with 429 and a Retry-After (01 §4c rule 5)", async () => {
    expect(PER_MINUTE).toBeGreaterThan(0);
    for (let i = 0; i < PER_MINUTE; i += 1) {
      const allowed = await GET(get(CALLER));
      expect(allowed.status).toBe(200);
    }

    const refused = await GET(get(CALLER));

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = (await refused.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("RATE_LIMITED");
  });

  it("limits per caller — one address's burst does not refuse another's first request", async () => {
    for (let i = 0; i <= PER_MINUTE; i += 1) await GET(get(CALLER));

    const other = await GET(get(OTHER_CALLER));

    expect(other.status).toBe(200);
  });

  // ADR-134 / ADR-140: this read is the only kind on `SECURITY.failOpenOnLimiterOutage`, and after M-2 the
  // decision is the limiter's, not this route's — the route imports no fail-open helper any more. The behaviour
  // it produces must be the same one ADR-134 ruled: a store that cannot answer does not close the front door.
  it("still answers 200 when the limiter store cannot answer (the fail-open allow-list)", async () => {
    configureRateLimiter(
      createRateLimiter({
        store: {
          increment: async () => ({
            ok: false,
            error: { code: "INTERNAL", message: "db down" },
          }),
        },
        burstAlertMultiple: SECURITY.burstAlertMultiple,
        failOpenOnLimiterOutage: SECURITY.failOpenOnLimiterOutage,
      }),
      "shared",
    );

    expect((await GET(get(CALLER))).status).toBe(200);
  });

  it("refuses when the store cannot answer and the policy is NOT on the allow-list", async () => {
    configureRateLimiter(
      createRateLimiter({
        store: {
          increment: async () => ({
            ok: false,
            error: { code: "INTERNAL", message: "db down" },
          }),
        },
        burstAlertMultiple: SECURITY.burstAlertMultiple,
        failOpenOnLimiterOutage: [],
      }),
      "shared",
    );

    expect((await GET(get(CALLER))).status).toBe(500);
  });
});
