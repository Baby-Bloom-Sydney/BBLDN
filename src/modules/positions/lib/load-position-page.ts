// S-P-05's server read: who is signed in → her live position → the view. One read, one shape; the route decides
// nothing but where to send a parent who has neither (04 §6.2 entry "S-P-03").
//
// SEAM, carried from `1d`: `getJourneySteps` and the store are keyed by `ParentId` (03 §2.5 `JourneyOwner`)
// while a session carries the `UserId`, and 02 §4.2 gives `parents` its own id beside `user_id`. The conversion
// is this one line and `call-layer`'s one line, and it stays open until the marketplace store lands.
import { auth } from "@/modules/auth";
import type { ParentId } from "@/modules/shared-types";
import { positions } from "./default-positions";
import { positionPageView } from "./position-page-view";
import type { PositionPageLoad } from "../types";

export async function loadPositionPage(): Promise<PositionPageLoad> {
  const session = await auth.requireRole("parent");
  if (!session.ok) return { kind: "signed-out" };
  const actor = {
    kind: "user",
    id: session.value.userId,
    role: "parent",
  } as const;
  const owner = session.value.userId as string as ParentId;
  const record = await positions.findLive(owner);
  if (!record.ok) return { kind: "failed" };
  if (record.value === null) return { kind: "no-position" };
  const allowed = await positions.listAllowed(
    { kind: "position", id: record.value.positionId },
    actor,
  );
  return {
    kind: "position",
    positionId: record.value.positionId,
    stage: record.value.stage,
    view: positionPageView(record.value, allowed),
  };
}
