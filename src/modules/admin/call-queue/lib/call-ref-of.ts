// 03 §2.7's `CallRef` — "the subject rule; no CallId" — from the row the admin opened. A position call is keyed
// on its position, a nanny call on its booking, and there is no third shape.
import type { CallRef } from "@/modules/call-layer";
import type { CallPartyRef } from "../types";

export function callRefOf(ref: CallPartyRef): CallRef {
  return ref.kind === "nanny"
    ? { kind: "nanny-call", bookingId: ref.bookingId }
    : { kind: "call", positionId: ref.positionId };
}
