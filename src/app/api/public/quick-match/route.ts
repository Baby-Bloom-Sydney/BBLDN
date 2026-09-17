// `POST /api/public/quick-match` (03 §6.3; `02.09`) — the inline widget's contract: the front door's three fields
// as JSON → count + the top cards. No auth, no write; the envelope of 01 §4c. Rate limit (07 §8 row 1) owed with
// the shared store.
import { z } from "zod";
import { err, ok, toResponse } from "@/modules/platform";
import { buildQuickMatchPage } from "@/modules/matching";
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

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
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
