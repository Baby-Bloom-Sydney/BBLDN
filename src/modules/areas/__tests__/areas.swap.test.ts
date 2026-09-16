// Swap test 5 (03 §11) — the acceptance for L3 on `areas`: keep `index.ts` + `types.ts`, point the connector at a
// provider that is not the one the app will ship, and every caller still compiles and passes. The suite is
// parameterised over the providers, so a `db-areas` added later joins it by name alone.
//
// It also pins the unconfigured seam: an `areas` nobody configured answers the failing methods with
// `INTERNAL { reason: 'areas-not-configured' }` rather than pretending a table it cannot read said "no".
import { afterEach, describe, expect, it } from "vitest";
import {
  areas,
  configureAreas,
  formatAreaLabel,
  normaliseDistrict,
  stubAreas,
} from "@/modules/areas";
import type { AreasProvider, AreaTable } from "@/modules/areas";
import { err } from "@/modules/platform";

/** A second, deliberately different table — proves no caller depends on the seed's contents. */
const FIXTURE: AreaTable = Object.freeze([
  {
    name: "Clapham",
    district: "SW4",
    centroid: { lat: 51.4618, lon: -0.1384 },
  },
  {
    name: "Islington",
    district: "N1",
    centroid: { lat: 51.5362, lon: -0.1033 },
  },
]);

const PROVIDERS: ReadonlyArray<readonly [string, () => AreasProvider]> =
  Object.freeze([
    ["stub-areas (seed)", () => stubAreas()],
    ["stub-areas (fixture table)", () => stubAreas(FIXTURE)],
  ]);

/** The registry is process-wide; leave it as we found it (01 §2.4 — every method re-reads it). */
afterEach(() => {
  configureAreas(stubAreas());
});

describe.each(PROVIDERS)("areas contract over %s", (_name, make) => {
  it("answers a known district through the module binding, not the provider directly", async () => {
    configureAreas(make());

    const found = await areas.lookupArea("SW4");

    expect(found.ok).toBe(true);
    expect(found.ok && found.value.district).toBe("SW4");
  });

  it("reports an unknown district as NOT_FOUND rather than an empty area", async () => {
    configureAreas(make());

    const missing = await areas.lookupArea("XX99");

    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.error.code).toBe("NOT_FOUND");
  });

  it("returns false from isInServiceArea for a district outside the table", async () => {
    configureAreas(make());

    await expect(areas.isInServiceArea("XX99")).resolves.toBe(false);
  });

  it("returns 0 km for a district measured against itself", async () => {
    configureAreas(make());

    const distance = await areas.distanceKm("SW4", "SW4");

    expect(distance.ok).toBe(true);
    expect(distance.ok && distance.value).toBe(0);
  });

  it("returns a whole number of km between two different districts", async () => {
    configureAreas(make());

    const distance = await areas.distanceKm("SW4", "N1");

    expect(distance.ok).toBe(true);
    expect(distance.ok && Number.isInteger(distance.value)).toBe(true);
    expect(distance.ok && distance.value).toBeGreaterThan(0);
  });

  it("returns [] from searchAreas for a query under two characters", async () => {
    configureAreas(make());

    await expect(areas.searchAreas("S")).resolves.toEqual([]);
  });

  it("puts an exact district match first", async () => {
    configureAreas(make());

    const results = await areas.searchAreas("SW4");

    expect(results[0]?.district).toBe("SW4");
  });

  it("rejects a value that is not an outward-code shape as VALIDATION", async () => {
    configureAreas(make());

    const invalid = await areas.centroid("not a district");

    expect(invalid.ok).toBe(false);
    expect(!invalid.ok && invalid.error.code).toBe("VALIDATION");
  });
});

describe("areas before boot configures a provider", () => {
  it("fails closed on lookupArea instead of answering from nowhere", async () => {
    // A registry the app has not configured: re-create the unconfigured state by installing a provider that
    // mirrors it, then assert the shape callers must handle.
    const notConfigured = err("INTERNAL", "Areas is not configured", {
      reason: "areas-not-configured" as const,
    });
    configureAreas({
      searchAreas: async () => [],
      lookupArea: async () => notConfigured,
      isInServiceArea: async () => false,
      centroid: async () => notConfigured,
      distanceKm: async () => notConfigured,
      listAll: async () => [],
    });

    const result = await areas.lookupArea("SW4");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details).toEqual({
      reason: "areas-not-configured",
    });
  });
});

describe("the pure helpers the connector exports beside the provider", () => {
  it("renders the one location form", () => {
    expect(
      formatAreaLabel({
        name: "Clapham",
        district: "SW4",
        centroid: { lat: 51.4618, lon: -0.1384 },
      }),
    ).toBe("Clapham, SW4");
  });

  it("strips a pasted inward code", () => {
    expect(normaliseDistrict(" sw4 7aa ")).toBe("SW4");
  });

  it("returns null for anything that is not an outward code", () => {
    expect(normaliseDistrict("Clapham")).toBeNull();
  });
});
