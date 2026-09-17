// `POST /api/public/quick-match` (03 §6.3; `02.09`) — the inline widget's contract: the front door's three fields
// as JSON → count + the top cards. No auth, no write; the envelope of 01 §4c. Rate limited on 07 §8 row 1
// (`publicRead`, keyed by the hashed caller address) over the shared `rate_limit_buckets` store of `0017` —
// **before the body is parsed**, so a burst cannot spend a match run, or even a JSON parse, per request.
import { z } from "zod";
import { err, ok, toResponse } from "@/modules/platform";
import { buildQuickMatchPage } from "@/modules/matching";
import { consumePublicReadLimit } from "../../_lib/consume-public-read-limit";
import { requestIdOf } from "../../_lib/request-id";

export const dynamic = "force-dynamic";

const BODY = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    parts: z
      .array(z.enum(["morning", "midday", "afternoon", "evening"]))
      .max(4)
      .default([]),
    district: z.string().trim().min(1).max(8),
  })
  .strict();

const SURFACE = "quick-match";

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
  const limited = await consumePublicReadLimit(request, requestId, SURFACE);
  if (limited !== null) return toResponse(limited, { requestId });
  const parsed = BODY.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return toResponse(
      err("VALIDATION", "Tell us your days, times and postcode district.", {
        reason: "invalid-input",
      }),
      { requestId },
    );
  const page = await buildQuickMatchPage({
    days: parsed.data.days as ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6>,
    parts: parsed.data.parts,
    district: parsed.data.district,
  });
  if (page.kind === "error")
    return toResponse(
      err("INTERNAL", "We couldn't run your match just now.", {}),
      { requestId },
    );
  return toResponse(
    ok({
      total: page.kind === "matches" ? page.total : 0,
      top:
        page.kind === "matches"
          ? page.cards.map(({ nanny, ranked }) => ({
              nannyId: nanny.nannyId,
              firstName: nanny.firstName,
              area: nanny.area,
              score: ranked.score,
              distanceKm: ranked.distanceKm,
            }))
          : [],
    }),
    { requestId },
  );
}
