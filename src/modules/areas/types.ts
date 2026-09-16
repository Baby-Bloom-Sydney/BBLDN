// areas — the module's type surface (01 §2.5). The connector of 03 §6.2, copied from the contract without
// renaming. Values live in index.ts. `areas` is a service module (01 §2.4; ADR-069) and imports `config`,
// `shared-types` and `platform` only (ADR-116).
import type { Result } from "@/modules/shared-types";

/** Outward code, upper-case: "SW4", "E1", "N1" (03 §6.2). */
export type PostcodeDistrict = string;

export type Coordinates = { readonly lat: number; readonly lon: number };

/** `borough` is display-only and never filters (ADR-101; 03 §12 item 22). */
export type Area = {
  readonly name: string;
  readonly district: PostcodeDistrict;
  readonly centroid: Coordinates;
  readonly borough?: string;
};

/** "Clapham, SW4" — the only rendered form (03 §6.3 rule 6). */
export type AreaLabel = `${string}, ${PostcodeDistrict}`;

/** `details` of every `areas` failure (03 §6.3 "Errors"). */
export type AreaErrorDetails =
  | { readonly reason: "not-in-table"; readonly district: PostcodeDistrict }
  | { readonly reason: "not-an-outward-code"; readonly field: "district" }
  | { readonly reason: "areas-not-configured" };

export type AreaResult<T> = Result<T, AreaErrorDetails>;

/**
 * 03 §6.2. `searchAreas`, `listAll` and `isInServiceArea` never fail for user input (`[]` / `false`);
 * everything else returns a `Result`.
 */
export type AreasProvider = {
  /** prefix on name OR district, case-insensitive; < 2 chars → []; default 10, cap 25; exact district first, then names A–Z. */
  readonly searchAreas: (
    query: string,
    limit?: number,
  ) => Promise<ReadonlyArray<Area>>;
  readonly lookupArea: (
    district: PostcodeDistrict,
  ) => Promise<AreaResult<Area>>;
  /** true iff `lookupArea` is ok — no second list, no zone, no borough filter. */
  readonly isInServiceArea: (district: PostcodeDistrict) => Promise<boolean>;
  readonly centroid: (
    district: PostcodeDistrict,
  ) => Promise<AreaResult<Coordinates>>;
  /** plain great-circle on centroids, floored to integer km; `a === b` → 0; unknown → NOT_FOUND, never Infinity. */
  readonly distanceKm: (
    a: PostcodeDistrict,
    b: PostcodeDistrict,
  ) => Promise<AreaResult<number>>;
  /** sorted by name; cached for the process lifetime. */
  readonly listAll: () => Promise<ReadonlyArray<Area>>;
};

/** What `stubAreas` is seeded with — the 20 areas of 03 §6.3, or a test's own table. */
export type AreaTable = ReadonlyArray<Area>;
