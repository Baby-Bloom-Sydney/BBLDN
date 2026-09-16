// `POST /api/webhooks/stripe` — the single completion spine (03 §5.4.3). One route, one call: the signature is
// verified inside `purchase-paths.parseEvent` **before** anything is parsed or dispatched (07 §10.1), and the
// idempotency insert on `eventId` happens inside `payments.handleWebhook`.
//
// **Fail closed.** The raw body is read as bytes (a Stripe signature is computed over the byte stream, so JSON
// parsing first would break verification), a missing `stripe-signature` header is a 400 before any module is
// called, and an unverified event is `E_EVENT_UNVERIFIED` → 400, never retried. A throwing handler returns 500
// so the provider retries; an event whose `LinkRef` we never minted is `ignored` with a 200.
//
// This replaces the Sydney webhook, which handled Stripe's own event types directly against `parent_subscriptions`
// and a `stripe_webhook_events` table — neither exists in the London data model (ADR-006, fresh).
import { payments } from "@/modules/payments";
import { err, nowInstant, toResponse } from "@/modules/platform";
import { requestIdOf } from "@/app/api/_lib/request-id";

export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "stripe-signature";

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (signature === null || signature === "")
    return toResponse(
      err("VALIDATION", "Unsigned request", { reason: "E_EVENT_UNVERIFIED" }),
      { requestId },
    );

  const rawBody = await request.text();
  const result = await payments.handleWebhook({
    rawBody,
    signature,
    receivedAt: nowInstant(),
  });
  return toResponse(result, { requestId });
}
