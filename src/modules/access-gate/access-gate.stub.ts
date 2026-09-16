// The `access-gate` stub — the decision answered from a seed, so `app` surfaces and admin screens can be built
// before `payments` has an inside. It runs the **real** `decideAccess`, so a stubbed gate can never disagree with
// the live one about what a standing means (03 §11 row 4: "reverse: `payments` stubbed → `access-gate` … still
// run").
import { nowInstant } from "@/modules/platform";
import type { AccessState } from "@/modules/payments";
import type { FamilyId, Instant } from "@/modules/shared-types";
import type { AccessDecision, AccessGateResult } from "./types";
import { decideAccess } from "./lib/decide-access";

export type StubAccessGateSeed = Readonly<Record<string, AccessState>>;

const NONE: AccessState = Object.freeze({ state: "none" });

export function stubAccessGate(seed: StubAccessGateSeed = {}) {
  return Object.freeze({
    hasAccess: async (
      familyId: FamilyId,
      now?: Instant,
    ): Promise<AccessGateResult<AccessDecision>> => ({
      ok: true,
      value: decideAccess(seed[familyId] ?? NONE, now ?? nowInstant()),
    }),
  });
}
