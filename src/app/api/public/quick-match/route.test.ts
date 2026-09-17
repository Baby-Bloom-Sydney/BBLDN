// 07 §8 row 1 on the quick-match API — the surface the row names first, and the expensive one: every call runs
// a match against the marketplace.
//
// The claim under test is **ordering**: the limit is consumed before the body is even parsed, so a refused
// caller costs one limiter round trip rather than a JSON parse and a ranking run. It is provable without
// mocking the matcher — the same deliberately malformed body answers 422 while the caller is inside the limit
// and 429 once it is not, which can only happen if the limiter runs first.
//
// The limiter is installed over the **memory** store here; the shared `rate_limit_buckets` store behind it is
// proved against the applied schema (`supabase/__tests__/constraints.test.ts`) and against the port seam
// (`src/boot/__tests__/db-0017-stores.test.ts`).
import { beforeEach, describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  memoryRateLimitStore,
} from "@/modules/platform";
import { POST } from "./route";

const CALLER = { "x-forwarded-for": "203.0.113.7" };
const OTHER_CALLER = { "x-forwarded-for": "198.51.100.4" };

/** Deliberately malformed: what the route answers for it is how we see which gate it reached. */
const post = (headers: Readonly<Record<string, string>> = CALLER) =>
  new Request("https://example.test/api/public/quick-match", {
    method: "POST",
    headers,
    body: JSON.stringify({ district: "" }),
  });

/** The policy's tightest window, so "a burst" means the smallest number of calls that can trip it. */
const PER_MINUTE = SECURITY.rateLimits.publicRead.perMinute ?? 0;

const codeOf = async (response: Response): Promise<string | undefined> => {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
};

beforeEach(() => {
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
    "shared",
  );
});

describe("POST /api/public/quick-match — 07 §8 row 1", () => {
  it("inside the limit the request reaches validation (422, not 429)", async () => {
    const response = await POST(post());

    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe("VALIDATION");
  });

  it("refuses a burst with 429 + Retry-After, before the body is parsed", async () => {
    expect(PER_MINUTE).toBeGreaterThan(0);
    for (let i = 0; i < PER_MINUTE; i += 1) {
      expect((await POST(post())).status).toBe(422);
    }

    const refused = await POST(post());

    // The body is as malformed as every call before it; the answer changed because the limiter now runs
    // first — which is the whole point of limiting the expensive surface.
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await codeOf(refused)).toBe("RATE_LIMITED");
  });

  it("limits per caller — one address's burst does not refuse another's first request", async () => {
    for (let i = 0; i <= PER_MINUTE; i += 1) await POST(post());

    const other = await POST(post(OTHER_CALLER));

    expect(other.status).toBe(422);
  });
});
