// `POST /api/legal/cookie-consent` — the cookie choice, recorded (FATE `10.23`; 07 §8 row 5; ADR-175).
//
// **This route was broken, and `3c` measured it rather than inferring it.** What it did before:
//
//   1. read `visitor_id` **from the request body** on an unauthenticated POST, so any caller could name any
//      visitor — including a real one, whose current row it would then collide with;
//   2. inserted with the **service role**, bypassing RLS, straight at the table;
//   3. carried **no rate limit**, while `SECURITY.rateLimits.cookieConsent` sat declared and unconsumed;
//   4. hardcoded a 365-day expiry instead of reading `SECURITY.retention.cookieExpiryDays`;
//   5. **did not supersede** — and `cookie_consent_records_current_idx` (`0004`) is UNIQUE on `(visitor_id)
//      where superseded_by is null`, so a visitor's **second** choice raised `23505` and the route answered
//      500. *A visitor could not change her mind.*
//
// (5) is the one that matters most and it is not a bug in a nicety: withdrawing consent must be as easy as
// giving it (Art 7(3), and 07 §6 states the right). A banner that records "accept" and then fails every later
// "reject" is a consent mechanism that only works in one direction.
//
// **What it does now**, and each of the three is a ruling this unit carries:
//
//   (a) **The visitor id comes from the signed cookie, never the body.** `_lib/visitor-cookie.ts` carries the
//       why. A body that still sends `visitor_id` is *rejected* rather than ignored, so a stale client learns.
//   (b) **The write is append-only through the connector.** `consent.recordCookieConsent` →
//       `record_cookie_consent` (`0017`) writes a NEW row and stamps `superseded_by` on the one it replaces,
//       inside one transaction behind a per-visitor advisory lock. The choice is never updated in place, the
//       read takes the latest, and a second choice cannot collide. That path existed, was wired, and had no
//       caller; this is its caller. The expiry comes with it — `cookieExpiryDays` is the connector's, so (4)
//       is fixed by deleting the arithmetic rather than by moving it.
//   (c) **It consumes a limiter and fails closed.** 07 §8 row 5 — `cookieConsent`, keyed by the hashed caller
//       address, 10/min. It is **not** on `SECURITY.failOpenOnLimiterOutage`, so a limiter outage refuses the
//       write rather than leaving an unauthenticated insert open to the world (ADR-134).
import { SECURITY } from "@/modules/config";
import { consent, log, ok, rateLimiter, toResponse } from "@/modules/platform";
import type { VisitorId } from "@/modules/shared-types";
import { consentPreferenceHeader } from "../../_lib/consent-preference-cookie";
import { ipKeyOf } from "../../_lib/ip-key";
import { requestIdOf } from "../../_lib/request-id";
import {
  mintVisitorId,
  visitorCookieHeader,
  visitorIdOf,
} from "../../_lib/visitor-cookie";
import { parseCookieChoice } from "./parse-cookie-choice";

export const dynamic = "force-dynamic";

const SURFACE = "cookie-consent";

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);

  // Before any work and before the body is read: a burst costs one limiter round trip, not a parse and a write.
  const limited = await rateLimiter.consume(
    await ipKeyOf(request),
    SECURITY.rateLimits.cookieConsent,
  );
  if (!limited.ok) {
    if (limited.error.code !== "RATE_LIMITED")
      log.error("rate limit: the limiter refused; the choice is not recorded", {
        requestId,
        action: "rate-limit",
        module: "platform",
        surface: SURFACE,
        errorCode: limited.error.code,
      });
    return toResponse(limited, { requestId });
  }

  const parsed = parseCookieChoice(await safeJson(request));
  if (!parsed.ok) return toResponse(parsed, { requestId });

  // (a) — ours, or freshly ours. A forged cookie and an absent one are the same thing: a new visitor.
  const visitorId = (visitorIdOf(request) ?? mintVisitorId()) as VisitorId;

  const recorded = await consent.recordCookieConsent({
    visitorId,
    choice: parsed.value.choice,
    analyticsEnabled: parsed.value.analyticsEnabled,
    marketingEnabled: parsed.value.marketingEnabled,
    context: { userAgent: request.headers.get("user-agent") ?? undefined },
  });
  if (!recorded.ok) return toResponse(recorded, { requestId });

  // Two cookies, and they are not the same kind of thing. The visitor cookie is re-issued on every recorded
  // choice so its life tracks the record's (07 §6.2 row 12). The preference cookie is the browser's copy of
  // **this** answer, and it is written here — on the response that recorded it — for the reason `3g` had to
  // build this surface at all: a browser that decides whether a tracker may load must be able to read the
  // answer without a round trip (ADR-175 (c)), and the copy must never be able to claim a choice the database
  // did not take. The response body still says nothing about the visitor id: it is HttpOnly for a reason, and
  // echoing it back undoes that.
  const response = toResponse(ok({ recorded: true }), { requestId });
  response.headers.append("Set-Cookie", visitorCookieHeader(visitorId));
  response.headers.append(
    "Set-Cookie",
    consentPreferenceHeader({
      choice: parsed.value.choice,
      analyticsEnabled: parsed.value.analyticsEnabled,
      marketingEnabled: parsed.value.marketingEnabled,
    }),
  );
  return response;
}

/**
 * The preference screen's read (FATE `10.22`). It exists so the toggles show **the record**, not the browser's
 * mirror of it: the Sydney screen initialised both toggles to `true` and then overwrote them from a client
 * cookie, so a visitor who had never chosen was shown two ticked boxes — the exact thing ADR-175 (a) forbids,
 * and a screen that would have recorded an "accept" she never made if she pressed Save.
 *
 * It answers only about the caller's own signed cookie, so there is no id to supply and none to leak. A visitor
 * with no cookie, a forged one, or a lapsed record all get the same `{ choice: null }` — "you have not chosen" —
 * which is the state the banner and the gate both treat as no consent.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);

  const limited = await rateLimiter.consume(
    await ipKeyOf(request),
    SECURITY.rateLimits.cookieConsent,
  );
  if (!limited.ok) return toResponse(limited, { requestId });

  const visitorId = visitorIdOf(request);
  if (visitorId === null) return toResponse(ok(NO_CHOICE), { requestId });

  const state = await consent.currentCookieChoice({
    kind: "visitor",
    id: visitorId as VisitorId,
  });
  if (!state.ok) return toResponse(state, { requestId });
  return toResponse(
    ok(
      state.value === null
        ? NO_CHOICE
        : {
            choice: state.value.choice,
            analyticsEnabled: state.value.analyticsEnabled,
            marketingEnabled: state.value.marketingEnabled,
            expiresAt: state.value.expiresAt,
          },
    ),
    { requestId },
  );
}

/** One frozen value, so "she has not chosen" is the same shape however it was arrived at. */
const NO_CHOICE = Object.freeze({
  choice: null,
  analyticsEnabled: false,
  marketingEnabled: false,
});

/** A body that is not JSON is a client error, not a 500 — `parseCookieChoice` turns `null` into the envelope. */
async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
