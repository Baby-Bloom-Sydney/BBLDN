// S-N-11 / S-N-22 — the hub's three states from the nanny's own row (04 §4.1 row 16; §4.2 b3; ADR-147).
// Isolation wins: an invited nanny sees the S-N-22 line whatever her level, because the flag records not
// having applied and the level is a different question. Below the configured level the hub is gated and the
// one action is the wizard; from it the hub is open. Copy per 04 §8's anchors (both drafts ☐ — B-25).
import { ENUMS } from "@/modules/shared-types";
import type { NannyHubView, NannyProfile } from "../types";
import { isNannyProfileComplete } from "./is-nanny-profile-complete";

const levelIndex = (level: NannyProfile["verificationLevel"]): number =>
  ENUMS.verification_level.indexOf(level);

export function nannyHubView(
  profile: NannyProfile,
  minVerificationLevel: number,
  hrefs: { readonly applyHref: string; readonly verificationHref: string },
): NannyHubView {
  const base = {
    firstName: profile.firstName,
    verificationLevel: profile.verificationLevel,
    profileComplete: isNannyProfileComplete(profile),
  };
  if (profile.isIsolated)
    return Object.freeze({
      ...base,
      state: "isolated",
      line: "You're set up with your family. Want to be matched with more families? Apply to join.",
      action: { label: "Apply to join", href: hrefs.applyHref },
    });
  if (levelIndex(profile.verificationLevel) < minVerificationLevel)
    return Object.freeze({
      ...base,
      state: "gated",
      line: "Verify your details to be introduced to families.",
      action: { label: "Verify now", href: hrefs.verificationHref },
    });
  return Object.freeze({
    ...base,
    state: "open",
    line: "Verified — you're in the pool",
    action: null,
  });
}
