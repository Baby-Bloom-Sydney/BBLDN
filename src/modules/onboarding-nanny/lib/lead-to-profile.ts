// What N5 hands `create_nanny_account()` from the lead (04 §4.1 row 7 "account, nanny record"): the years, the
// band's floor as the minimum rate (02 §4.2 `hourly_rate_min_pence`), the availability grid and the bio. Only
// what the lead captured — an absent answer is an omitted key, never a null the database has to un-write.
import type { NannyLead, NannyProfilePatch } from "../types";

export function leadToProfile(lead: NannyLead): NannyProfilePatch {
  return Object.freeze({
    ...(lead.yearsExperience === null ? {} : { yearsExperience: lead.yearsExperience }),
    ...(lead.rateBand === null ? {} : { hourlyRateMinPence: lead.rateBand.minPence }),
    ...(lead.availability === null ? {} : { availability: lead.availability }),
    ...(lead.bio === null ? {} : { bio: lead.bio }),
  });
}
