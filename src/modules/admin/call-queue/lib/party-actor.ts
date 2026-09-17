// One `Actor` for either kind of call, built from the party the row names. Everything a lever needs to know
// about who is acting comes from the session inside `admin-on-behalf`'s gate; what travels from here is only
// **who it is for**, which 07 §5.4 row 6 requires on every on-behalf write.
import type { Actor } from "@/modules/shared-types";
import type { CallPartyRef } from "../types";
import { nannyCallActor } from "./nanny-call-actor";
import { onBehalfOfParent } from "./on-behalf-actor";

export function partyActor(ref: CallPartyRef): Actor {
  return ref.kind === "nanny"
    ? nannyCallActor(ref.nannyId)
    : onBehalfOfParent(ref.parentId);
}
