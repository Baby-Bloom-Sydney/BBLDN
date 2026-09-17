// S-N-11's one server read (05 §7 rule 5): the nanny's own row → the three-state view (ADR-147). `null` when
// there is no nanny row for the session — the route decides what a nanny with an account and no party row sees
// (the profile completion, S-N-18).
import { MATCHING } from "@/modules/config";
import type { NannyHubView } from "../types";
import { loadNannyProfile } from "./load-nanny-profile";
import { nannyHubView } from "./nanny-hub-view";

const HREFS = Object.freeze({
  applyHref: "/nanny/apply",
  verificationHref: "/nanny/onboarding-verification",
});

export async function loadNannyHub(): Promise<NannyHubView | null> {
  const profile = await loadNannyProfile();
  return profile === null ? null : nannyHubView(profile, MATCHING.minVerificationLevel, HREFS);
}
