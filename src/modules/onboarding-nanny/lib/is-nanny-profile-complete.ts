// `03.18` — the completeness gate, as `update_nanny_profile()` (`0021`) computes it: years, qualification,
// rate, availability, bio, district and mobile all present. The database is the writer of `profile_visible`;
// this mirror only drives the stepper's "complete" state and the memory double, and `int.rpc-0021` holds the
// SQL to the same rule.
import type { NannyProfile } from "../types";

export function isNannyProfileComplete(
  profile: Pick<
    NannyProfile,
    | "yearsExperience"
    | "qualification"
    | "hourlyRateMinPence"
    | "availability"
    | "bio"
    | "district"
    | "mobile"
  >,
): boolean {
  return (
    profile.yearsExperience !== undefined &&
    profile.qualification !== undefined &&
    profile.qualification !== "" &&
    profile.hourlyRateMinPence !== undefined &&
    profile.availability !== undefined &&
    (profile.bio ?? "") !== "" &&
    (profile.district ?? "") !== "" &&
    (profile.mobile ?? "") !== ""
  );
}
