// 03 §9.5 `meta` sink — the Conversions API half of the London dataset (`02.25`, `11.34`; ADR-055).
//
// **The whole of it is one decision made four times, in this order, and every branch that is not a send is a
// send that does not happen.**
//
//   1. Not in `config/meta-events.ts`'s map → nothing. The map is an allow-list, not a filter.
//   2. No consent subject (`admin` · `system` · `anonymous`) → nothing (`meta-consent-subject.ts`).
//   3. The consent read failed → nothing, **and the sink reports failure**, so `fan-out.ts` logs
//      `ALERT_EVENT_SINK_FAILED`. "We could not find out whether she agreed" is an outage, not a green light,
//      and it should be visible as one (`ecc-lite` rule 5).
//   4. She has not agreed → nothing, and the sink reports **success**: 03 §9.5 says "no consent → `ok`,
//      nothing sent". Not sending is the correct outcome, not a fault, and an alert on every non-consenting
//      visitor would train an operator to ignore the alert.
//
// It is wired only when `META_API.configured` (`wire-events.ts`), so an unset dataset id sends nothing and says
// so on the boot report rather than posting to a guessed endpoint.
//
// The access token is passed in the **request body**, never the query string: a URL reaches proxy logs, error
// reporters and the `cause` of a thrown `fetch`, and a token in a log is a token that has leaked. Nothing here
// logs the token, the endpoint, or `props`.
import type { Result } from "@/modules/shared-types";
import { err } from "../../lib/err";
import { ok } from "../../lib/ok";
import type { MetaSinkDeps, Sink } from "../types";
import { metaConsentSubject } from "./meta-consent-subject";
import { metaEventName } from "./meta-event-name";
import { metaPayload } from "./meta-payload";

const NOTHING_SENT = ok(undefined);

export function metaSink(deps: MetaSinkDeps): Sink {
  const send = deps.fetch ?? fetch;
  return Object.freeze({
    id: "meta" as const,
    ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    handle: async (envelope): Promise<Result<void>> => {
      const eventName = metaEventName(envelope.name);
      if (eventName === undefined) return NOTHING_SENT;

      const subject = metaConsentSubject(envelope);
      if (subject === null) return NOTHING_SENT;

      const consented = await deps.consent.hasMarketing(subject);
      if (!consented.ok)
        return err(
          "INTERNAL",
          "Marketing consent could not be read",
          undefined,
          consented.error,
        );
      if (!consented.value) return NOTHING_SENT;

      const response = await send(deps.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: [await metaPayload(envelope, eventName)],
          access_token: deps.accessToken,
        }),
      });
      if (!response.ok)
        return err("INTERNAL", "Conversions API refused the event", {
          reason: "meta-capi",
          status: response.status,
        });
      return NOTHING_SENT;
    },
  });
}
