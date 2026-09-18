// S-N-21's one server read (05 §7 rule 5). Same two reads as S-N-17's, into the settings tree; the profile
// travels with the view because the contact panel renders S-N-18's own location step and prefills from it
// (04 §6.3 "fields already held are prefilled").
import { loadVerificationStatus } from "@/modules/verification";
import type { VerificationState } from "@/modules/verification";
import type { NannyProfile, NannySettingsView } from "../types";
import { loadNannyProfile } from "./load-nanny-profile";
import { nannySettingsView } from "./nanny-settings-view";
import { NOT_STARTED_VERIFICATION } from "./not-started-verification";

export async function loadNannySettings(): Promise<{
  readonly view: NannySettingsView;
  readonly profile: NannyProfile;
} | null> {
  const [profile, status] = await Promise.all([
    loadNannyProfile(),
    loadVerificationStatus(),
  ]);
  if (profile === null) return null;
  const state: VerificationState =
    status ?? NOT_STARTED_VERIFICATION(profile.userId);
  return Object.freeze({ view: nannySettingsView(profile, state), profile });
}
