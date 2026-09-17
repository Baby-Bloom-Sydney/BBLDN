// `GET /api/areas?q=` (03 §6.3 — `public-site`'s thin route over `areas.searchAreas` / `listAll`): the combobox's
// source. Name + district only; the envelope of 01 §4c. No auth (reference data; anon SELECT on the table).
// Rate limited on 07 §8 row 1 (`publicRead`, keyed by the hashed caller address) over the shared
// `rate_limit_buckets` store of `0017` — before any work, so a burst costs one limiter round trip, not a scan.
import { areas } from "@/modules/areas";
import { ok, toResponse } from "@/modules/platform";
import { parseAreaQuery } from "@/modules/public-site";
import { consumePublicReadLimit } from "../_lib/consume-public-read-limit";
import { requestIdOf } from "../_lib/request-id";

export const dynamic = "force-dynamic";

const SURFACE = "areas";

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
  const limited = await consumePublicReadLimit(request, requestId, SURFACE);
  if (limited !== null) return toResponse(limited, { requestId });
  const { q } = parseAreaQuery(new URL(request.url).searchParams);
  const found = q === null ? await areas.listAll() : await areas.searchAreas(q);
  return toResponse(
    ok(found.map(({ name, district }) => ({ name, district }))),
    { requestId },
  );
}
