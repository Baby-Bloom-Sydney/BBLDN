// The shape every gated lever shares: resolve the admin actor from the session, then run the inside with it —
// or return the gate's refusal unchanged. Extracted so `gate-admin-on-behalf.ts` reads as eight one-line
// forwards and no lever can accidentally be written without the gate in front of it.
import { gatedAdminActor } from "./gated-admin-actor";
import type { AdminOnBehalfResult, GatedAdminActor } from "../types";
import type { Actor } from "@/modules/shared-types";

export const gatedCall = async <T>(
  supplied: Actor,
  run: (actor: GatedAdminActor) => Promise<AdminOnBehalfResult<T>>,
): Promise<AdminOnBehalfResult<T>> => {
  const gated = await gatedAdminActor(supplied);
  return gated.ok ? run(gated.value) : gated;
};
