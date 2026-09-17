// The call state a row shows, derived from the booking (03 §2.7).
//
// The document derives a **nanny-commission** call's state this way and stores a position call's in the stage
// model (02 R-1). The queue applies the same derivation to a position call too, and the reason is worth
// stating: the call mirror has **no table** — `memoryCallMirrorStore` is per instance and forgets on a cold
// start (P1-WIRE-2's recorded reason for wiring `call-layer` outside production only), so a stored state is not
// a thing this screen can read in production. What the booking row says is durable and is the same fact: a
// live row is `slot-chosen`, a `done` / `cancelled` row is `done`, and a `no-answer` row is a call that has
// gone back to `awaiting-slot` for its retry (R5; ADR-073).
//
// Where the two could disagree — a call whose mirror moved without a booking write — the row is the one that
// survives a restart, so the row wins here and the disagreement is recorded (`1g` owes the mirror a table).
import type { CallState } from "@/modules/shared-types";
import type { CallListItem } from "@/modules/shared-types";

export function callStateOf(item: CallListItem): CallState {
  const { status } = item.booking;
  if (status === "no-answer") return "awaiting-slot";
  if (status === "done" || status === "cancelled") return "done";
  return "slot-chosen";
}
