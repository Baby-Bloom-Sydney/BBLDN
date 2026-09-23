// **Who the Conversions API send is asked about** (03 §9.5; 07 §2.9 "the only gate").
//
// A server-side send for a visitor who declined is the same violation as a script mounted before she chose —
// it is simply wearing a different hat, and it is the harder of the two to notice because nothing appears in
// her browser. So the sink asks `ConsentReader.hasMarketing(subject)` before every send, and this file decides
// what `subject` is.
//
// It answers `null` — meaning **do not send** — for every actor we cannot put a consent question to:
//
//   - `admin` and `system`: the person whose behaviour the event describes is not the actor, and guessing which
//     user an admin acted for is exactly the kind of inference that turns "we asked her" into "we assumed".
//     An `admin` acting `onBehalfOf` a user is deliberately included in this refusal: she consented to being
//     helped, not to being measured.
//   - `anonymous`: no subject exists, so no record can.
//
// Fail closed (`ecc-lite` rule 5): unknown denies. The cost is under-reporting admin-initiated conversions,
// which is the correct trade — a missing row in a dashboard is recoverable; a send we had no consent for is not.
import type { ConsentSubject } from "../../consent/types";
import type { EventEnvelope } from "../types";

export function metaConsentSubject(
  envelope: EventEnvelope,
): ConsentSubject | null {
  const actor = envelope.actor;
  if (actor.kind === "user") return { kind: "user", id: actor.id };
  if (actor.kind === "visitor") return { kind: "visitor", id: actor.id };
  return null;
}
