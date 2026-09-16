// `stub-areas` (03 §6.3; swap test 5) — the in-memory `AreasProvider`. Selected by `AREAS_SOURCE.provider = "stub"`
// and the only provider this repo has: the database-backed `db-areas` needs the `areas` table, which arrives with
// migration `0001` (HANDOFF §11 — not this unit). Self-contained on purpose: a swap must not reach into the inside
// it replaces, so the seed table and the great-circle maths are private to this file.
//
// Seed = the 20 areas 03 §6.3 names, with their real centroids. Production code, not a test fixture (05 §3 rule 1).
import { err } from "@/modules/platform";
import { ok } from "@/modules/platform";
import type {
  Area,
  AreaResult,
  AreaTable,
  AreasProvider,
  Coordinates,
  PostcodeDistrict,
} from "./types";
import { normaliseDistrict } from "./lib/normalise-district";

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const EARTH_RADIUS_KM = 6371;

const SEED: AreaTable = Object.freeze([
  {
    name: "Balham",
    district: "SW12",
    centroid: { lat: 51.4432, lon: -0.1526 },
  },
  {
    name: "Battersea",
    district: "SW11",
    centroid: { lat: 51.4712, lon: -0.1635 },
  },
  {
    name: "Brixton",
    district: "SW2",
    centroid: { lat: 51.4549, lon: -0.1157 },
  },
  { name: "Camden", district: "NW1", centroid: { lat: 51.5356, lon: -0.1401 } },
  {
    name: "Chiswick",
    district: "W4",
    centroid: { lat: 51.4912, lon: -0.2639 },
  },
  {
    name: "Crouch End",
    district: "N8",
    centroid: { lat: 51.5806, lon: -0.1201 },
  },
  { name: "Ealing", district: "W5", centroid: { lat: 51.513, lon: -0.3045 } },
  { name: "Fulham", district: "SW6", centroid: { lat: 51.4785, lon: -0.1954 } },
  {
    name: "Greenwich",
    district: "SE10",
    centroid: { lat: 51.4826, lon: -0.0077 },
  },
  { name: "Hackney", district: "E8", centroid: { lat: 51.5416, lon: -0.0587 } },
  {
    name: "Hampstead",
    district: "NW3",
    centroid: { lat: 51.5557, lon: -0.1784 },
  },
  {
    name: "Islington",
    district: "N1",
    centroid: { lat: 51.5362, lon: -0.1033 },
  },
  {
    name: "Peckham",
    district: "SE15",
    centroid: { lat: 51.4739, lon: -0.069 },
  },
  {
    name: "Putney",
    district: "SW15",
    centroid: { lat: 51.4614, lon: -0.2168 },
  },
  {
    name: "Richmond",
    district: "TW9",
    centroid: { lat: 51.4613, lon: -0.3037 },
  },
  {
    name: "Shoreditch",
    district: "EC2A",
    centroid: { lat: 51.5243, lon: -0.0807 },
  },
  {
    name: "Clapham",
    district: "SW4",
    centroid: { lat: 51.4618, lon: -0.1384 },
  },
  {
    name: "Stratford",
    district: "E15",
    centroid: { lat: 51.5416, lon: -0.0034 },
  },
  {
    name: "Walthamstow",
    district: "E17",
    centroid: { lat: 51.5863, lon: -0.0198 },
  },
  {
    name: "Wimbledon",
    district: "SW19",
    centroid: { lat: 51.4214, lon: -0.2064 },
  },
] as const satisfies AreaTable);

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Plain great-circle on centroids, floored to integer km (03 §6.2). */
function greatCircleKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return Math.floor(
    EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)),
  );
}

export function stubAreas(table: AreaTable = SEED): AreasProvider {
  const byDistrict = new Map(table.map((area) => [area.district, area]));
  const byName = Object.freeze(
    [...table].sort((left, right) => left.name.localeCompare(right.name)),
  );

  const resolve = (raw: PostcodeDistrict): AreaResult<Area> => {
    const district = normaliseDistrict(raw);
    if (district === null) {
      return err("VALIDATION", "Not an outward-code shape", {
        reason: "not-an-outward-code",
        field: "district",
      });
    }
    const area = byDistrict.get(district);
    return area === undefined
      ? err("NOT_FOUND", "District is not in the areas table", {
          reason: "not-in-table",
          district,
        })
      : ok(area);
  };

  return Object.freeze({
    searchAreas: async (query, limit = DEFAULT_LIMIT) => {
      const needle = query.trim().toUpperCase();
      if (needle.length < MIN_QUERY_LENGTH) return Object.freeze([]);
      const exactDistrict = byName.filter((area) => area.district === needle);
      const rest = byName.filter(
        (area) =>
          area.district !== needle &&
          (area.district.startsWith(needle) ||
            area.name.toUpperCase().startsWith(needle)),
      );
      return Object.freeze(
        [...exactDistrict, ...rest].slice(0, Math.min(limit, MAX_LIMIT)),
      );
    },
    lookupArea: async (district) => resolve(district),
    isInServiceArea: async (district) => resolve(district).ok,
    centroid: async (district) => {
      const area = resolve(district);
      return area.ok ? ok(area.value.centroid) : area;
    },
    distanceKm: async (a, b) => {
      const from = resolve(a);
      if (!from.ok) return from;
      const to = resolve(b);
      if (!to.ok) return to;
      return ok(
        from.value.district === to.value.district
          ? 0
          : greatCircleKm(from.value.centroid, to.value.centroid),
      );
    },
    listAll: async () => byName,
  });
}
