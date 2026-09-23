// The Conversions API body for one envelope (03 §9.5). Three things about it are load-bearing:
//
//  1. **`event_id` is `envelope.id`.** 03 §9.2 says so in the type itself ("`id` = Meta event_id for pixel /
//     CAPI dedup"). It is what lets the same conversion arrive twice — once from a browser, once from here —
//     and be counted once. Today the browser fires only `PageView`, which this sink never sends, so no pair
//     exists to collide; the id is on every send regardless, because the seam that will fire the pair
//     (`platform/events/client.ts`'s `track`, unit F-c) must find deduplication already true rather than
//     have to add it.
//  2. **Ids only, hashed.** 03 §9.2 rule 3 already forbids email, name, phone and free text in `props`, so
//     there is none here to send. `external_id` is a SHA-256 of our own user id — Meta requires the hash, and
//     the hash is also what stops our identifier space leaving the building.
//  3. **`fbc` is derived, never invented.** `attribution.fbclid` has already been dropped upstream for a
//     visitor without marketing consent (`create-events.ts`'s `stripFbclid`, 07 §2.9), so if it is here, it
//     rode in on a consented event.
import { META_EVENTS, URLS } from "@/modules/config";
import type { EventEnvelope } from "../types";
import type { MetaEventPayload } from "../types";
import { sha256Hex } from "./sha256-hex";

/** Meta's click-id format: `fb.<subdomain-index>.<creation-ms>.<fbclid>`; `1` = the domain itself. */
const FBC_PREFIX = "fb.1";

function audienceOf(envelope: EventEnvelope): string | undefined {
  const actor = envelope.actor;
  if (actor.kind === "user") return META_EVENTS.contentCategory[actor.role];
  const subject = envelope.subject;
  if (subject?.kind === "parent" || subject?.kind === "nanny")
    return META_EVENTS.contentCategory[subject.kind];
  return undefined;
}

function sourceUrlOf(envelope: EventEnvelope): string {
  const path = envelope.attribution?.landingPath;
  return path === undefined ? URLS.app : `${URLS.app}${path}`;
}

export async function metaPayload(
  envelope: EventEnvelope,
  eventName: string,
): Promise<MetaEventPayload> {
  const eventTimeMs = Date.parse(envelope.ts);
  const fbclid = envelope.attribution?.fbclid;
  const externalId =
    envelope.actor.kind === "user" || envelope.actor.kind === "visitor"
      ? await sha256Hex(envelope.actor.id)
      : undefined;
  const audience = audienceOf(envelope);
  return Object.freeze({
    event_name: eventName,
    event_time: Math.floor(eventTimeMs / 1000),
    event_id: envelope.id,
    action_source: "website" as const,
    event_source_url: sourceUrlOf(envelope),
    user_data: Object.freeze({
      ...(externalId === undefined ? {} : { external_id: externalId }),
      ...(fbclid === undefined
        ? {}
        : { fbc: `${FBC_PREFIX}.${eventTimeMs}.${fbclid}` }),
    }),
    ...(audience === undefined
      ? {}
      : { custom_data: Object.freeze({ content_category: audience }) }),
  });
}
