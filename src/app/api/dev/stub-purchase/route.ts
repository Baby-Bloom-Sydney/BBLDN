// `POST /api/dev/stub-purchase` — the stub provider's "admin click = paid" endpoint (03 §5.5). It synthesises
// nothing itself: the admin panel builds a `PurchaseEvent`, this route hands it to the **same**
// `payments.handleWebhook` a real provider would reach, so the record, the events, `app-ready` and the access
// gate all run for real.
//
// **Three gates, in this order, each fail-closed (07 §5.5 layer 3):**
//   1. the resolved environment must not be production (ADR-108) — there the route **404s**, as if it did not
//      exist, and `config`'s env schema has already refused `PURCHASE_PROVIDER = stub-stripe` there anyway;
//   2. `auth.requireRole('admin')`, which also requires `aal2` (07 §5.4 row 2) — so a leaked secret alone is
//      never enough;
//   3. Bearer `STUB_EVENT_SECRET`, constant-time, an unset secret rejecting every caller.
import { env } from "@/modules/config/server";
import { auth } from "@/modules/auth";
import { payments } from "@/modules/payments";
import { err, log, nowInstant, toResponse } from "@/modules/platform";
import { authoriseBearer } from "@/app/api/_lib/authorise-bearer";
import { requestIdOf } from "@/app/api/_lib/request-id";

export const dynamic = "force-dynamic";

const NOT_FOUND = 404;

export async function POST(request: Request): Promise<Response> {
  if (env.environment === "production")
    return new Response(null, { status: NOT_FOUND });

  const requestId = requestIdOf(request);
  const session = await auth.requireRole("admin");
  if (!session.ok) return toResponse(session, { requestId });

  const secret = env.server.STUB_EVENT_SECRET;
  if (!authoriseBearer(request.headers.get("authorization"), secret)) {
    log.warn("stub purchase rejected: bad or missing stub event secret", {
      requestId,
      action: "stub-purchase",
    });
    return toResponse(
      err("UNAUTHENTICATED", "Unauthorised", { reason: "bad-stub-secret" }),
      { requestId },
    );
  }

  const rawBody = await request.text();
  const result = await payments.handleWebhook({
    rawBody,
    signature: secret ?? "",
    receivedAt: nowInstant(),
  });
  return toResponse(result, { requestId });
}
