// S-P-03's server read of the rail (04 §7.1): who is signed in → `positions.getJourneySteps`. The read model is
// `positions`' (03 §2.5); this only turns a session into the call and answers a shape the route renders.
//
// `1i` adds one **optional** parameter: rows 7 and 8's facts. They are handed in rather than read, because
// `call-layer` may import neither `payments` nor `app` (01 §2.3) and neither may `positions` — the route,
// which may, reads them and passes them through here. Omitted, both rows read `pending`, which is what they did
// before `1i` and remains the honest answer when nobody asked.
//
// SEAM, recorded (1d): `getJourneySteps` is keyed by `ParentId` (03 §2.5 `JourneyOwner`) while a session carries
// the `UserId`, and 02 §4 gives `parents` its own id beside `user_id`. Until `positions`' inside settles which
// key the read model takes — or resolves one from the other — the user id is passed through here, in one
// place, so the fix is one line.
import { positions } from "@/modules/positions";
import type { AppRailFacts } from "@/modules/positions";
import type { ParentId } from "@/modules/shared-types";
import type { ParentJourneyLoad } from "../types";
import { parentActor } from "./parent-actor";

export async function loadParentJourney(
  app?: AppRailFacts,
): Promise<ParentJourneyLoad> {
  const actor = await parentActor();
  if (!actor.ok) return { kind: "signed-out" };
  const owner = actor.value.id as string as ParentId;
  const steps = await positions.getJourneySteps(owner, app);
  return steps.ok ? { kind: "steps", steps: steps.value } : { kind: "failed" };
}
