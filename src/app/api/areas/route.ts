// `GET /api/areas?q=` (03 §6.3 — `public-site`'s thin route over `areas.searchAreas` / `listAll`): the combobox's
// source. Name + district only; the envelope of 01 §4c. No auth (reference data; anon SELECT on the table).
// Rate limit (07 §8 row 1) is owed to the unit that gives `configureRateLimiter` a shared store.
// **P1-WIRE-2 looked at this and did not build it, on purpose.** `assertSharedStore` denies every `consume`
// whenever `NODE_ENV === "production"` — on Vercel that is **preview and production both** — until boot calls
// `configureRateLimiter(limiter, "shared")`. The shared store is `rate_limit_buckets`, which S5b creates in
// migration `0017`; `main` stops at `0016` and S5b is not merged. So wiring `consume` here today would deny
// every request to this route on every deployed environment. Declaring the per-instance memory store
// "shared" instead is the exact failure that assertion exists to catch. Land it with S5b, not before.
import { areas } from "@/modules/areas";
import { ok, toResponse } from "@/modules/platform";
import { parseAreaQuery } from "@/modules/public-site";
import { requestIdOf } from "../_lib/request-id";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { q } = parseAreaQuery(new URL(request.url).searchParams);
  const found = q === null ? await areas.listAll() : await areas.searchAreas(q);
  return toResponse(
    ok(found.map(({ name, district }) => ({ name, district }))),
    { requestId: requestIdOf(request) },
  );
}
