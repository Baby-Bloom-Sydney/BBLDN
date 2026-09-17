// A `PublicNanny` → the `scoring` snapshot (03 §7.2 `Candidate`). The view's predicate already excludes
// isolated, suspended and under-level nannies; the ordinal is still carried so `scoring` re-checks it (the rule
// lives in one place — 03 §7.4). `silentHold` and `activeConnectionWithFamily` are `false` on the public read:
// the hold is Phase 2 (`05.04`) and the family rule needs a position (03 §7.5).
import type { Candidate } from "@/modules/scoring";
import type { PublicNanny } from "../types";
import { qualificationRung } from "./qualification-rung";
import { verificationLevelOrdinal } from "./verification-level-ordinal";

export function toCandidate(nanny: PublicNanny): Candidate {
  return Object.freeze({
    nannyId: nanny.nannyId,
    area: nanny.area,
    availability: nanny.availability,
    experienceYears: nanny.yearsExperience ?? 0,
    qualificationRung: qualificationRung(nanny.qualification),
    certifications: nanny.certificates,
    hasCar: nanny.hasCar,
    attributes: Object.freeze({
      licence: nanny.hasDrivingLicence,
      car: nanny.hasCar,
      nonSmoker: nanny.isNonSmoker === true,
      pets: nanny.comfortableWithPets === true,
    }),
    languages: nanny.languages,
    availableFrom: nanny.availableFrom ?? undefined,
    verificationLevel: verificationLevelOrdinal(nanny.verificationLevel),
    isolated: false,
    silentHold: false,
    activeConnectionWithFamily: false,
  });
}
