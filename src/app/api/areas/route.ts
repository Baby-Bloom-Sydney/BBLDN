// `GET /api/areas?q=` (03 §6.3 — `public-site`'s thin route over `areas.searchAreas` / `listAll`): the combobox's
// source. Name + district only; the envelope of 01 §4c. No auth (reference data; anon SELECT on the table).
// Rate limit (07 §8 row 1) is owed to the unit that gives `configureRateLimiter` a shared store.
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
