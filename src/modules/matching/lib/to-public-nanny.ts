// One `nanny_public` row → a `PublicNanny`, or `null` when the row lacks what a screen must have (id, first
// name, district). The photo URL is handed in already signed (07 §5.3 rule 1 — the read model mints it).
import type { Database, Instant, NannyId } from "@/modules/shared-types";
import type { PublicNanny } from "../types";
import { availabilityBlocks } from "./availability-blocks";

export type NannyPublicRow = Database["public"]["Views"]["nanny_public"]["Row"];

export function toPublicNanny(
  row: NannyPublicRow,
  photoUrl: string | null,
): PublicNanny | null {
  if (
    row.nanny_id === null ||
    row.first_name === null ||
    row.district === null ||
    row.verification_level === null
  )
    return null;
  return Object.freeze({
    nannyId: row.nanny_id as NannyId,
    firstName: row.first_name,
    area: { area: row.area ?? row.district, district: row.district },
    photoUrl,
    bio: row.bio,
    yearsExperience: row.years_experience,
    qualification: row.qualification,
    certificates: Object.freeze([...(row.certificates ?? [])]),
    languages: Object.freeze([...(row.languages ?? [])]),
    hasCar: row.has_car === true,
    hasDrivingLicence: row.has_driving_licence === true,
    isNonSmoker: row.is_non_smoker,
    comfortableWithPets: row.comfortable_with_pets,
    availability: availabilityBlocks(row.availability),
    availableFrom: (row.available_from as Instant | null) ?? null,
    verificationLevel: row.verification_level,
  });
}
