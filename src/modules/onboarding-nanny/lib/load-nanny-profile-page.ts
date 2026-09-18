// S-N-17's one server read (05 §7 rule 5 — the route file is thin): her own rows and her verification state, in
// parallel, into the pure view.
//
// **The level is read, never derived** (`2c`'s first rule): `verification.getStatus` is the only road to it, and
// a session with no verification row yet reads as L0 with four `not_started` sections — which is the truth for
// an account that has not started the wizard, and is what S-N-17 should say.
//
// `null` when there is no nanny row for the session; the route decides where such a session goes.
import { loadVerificationStatus } from "@/modules/verification";
import type { VerificationState } from "@/modules/verification";
import type { NannyProfileView } from "../types";
import { loadNannyProfile } from "./load-nanny-profile";
import { nannyProfileView } from "./nanny-profile-view";
import { NOT_STARTED_VERIFICATION } from "./not-started-verification";

export async function loadNannyProfilePage(): Promise<NannyProfileView | null> {
  const [profile, status] = await Promise.all([
    loadNannyProfile(),
    loadVerificationStatus(),
  ]);
  if (profile === null) return null;
  const state: VerificationState =
    status ?? NOT_STARTED_VERIFICATION(profile.userId);
  return nannyProfileView(profile, state);
}
