// `db-areas` (03 §6.3): the table is read once per process through the port, inactive rows are dropped, a
// failed load answers the closed values and is retried on the next call rather than cached as "no areas".
import { describe, expect, it } from "vitest";
import { dbAreas } from "../db-areas";
import { fakeDataPort } from "./fixtures/fake-data-port";

const ROWS = [
  {
    district: "SW4",
    area: "Clapham",
    lat: 51.4618,
    lon: -0.1384,
    borough: "Lambeth",
    is_active: true,
    source: "onspd",
    seeded_at: "2026-09-16T00:00:00.000Z",
  },
  {
    district: "N1",
    area: "Islington",
    lat: 51.5362,
    lon: -0.1033,
    borough: null,
    is_active: true,
    source: "onspd",
    seeded_at: "2026-09-16T00:00:00.000Z",
  },
  {
    district: "XX1",
    area: "Retired",
    lat: 0,
    lon: 0,
    borough: null,
    is_active: false,
    source: "onspd",
    seeded_at: "2026-09-16T00:00:00.000Z",
  },
];

describe("dbAreas", () => {
  it("serves the active rows of the table through the areas contract", async () => {
    const fake = fakeDataPort({ areas: ROWS });
    const provider = dbAreas(fake.port);
    const clapham = await provider.lookupArea("SW4");
    expect(clapham).toEqual({
      ok: true,
      value: {
        name: "Clapham",
        district: "SW4",
        centroid: { lat: 51.4618, lon: -0.1384 },
        borough: "Lambeth",
      },
    });
    expect(await provider.isInServiceArea("N1")).toBe(true);
    expect(await provider.isInServiceArea("XX1")).toBe(false);
    expect((await provider.listAll()).map((a) => a.name)).toEqual([
      "Clapham",
      "Islington",
    ]);
  });

  it("reads the table exactly once per process — cached for the process lifetime (03 §6.2)", async () => {
    const fake = fakeDataPort({ areas: ROWS });
    const provider = dbAreas(fake.port);
    await Promise.all([
      provider.lookupArea("SW4"),
      provider.listAll(),
      provider.distanceKm("SW4", "N1"),
    ]);
    await provider.searchAreas("Cl");
    expect(fake.calls).toEqual([
      { name: "areas.loadTable", scope: "session", uow: undefined },
    ]);
  });

  it("answers the closed values while the table cannot be read, and retries on the next call", async () => {
    const fake = fakeDataPort({ areas: ROWS });
    fake.state.failWith = { code: "INTERNAL", message: "down" };
    const provider = dbAreas(fake.port);

    const failed = await provider.lookupArea("SW4");
    expect(!failed.ok && failed.error.details?.reason).toBe(
      "areas-not-configured",
    );
    expect(await provider.isInServiceArea("SW4")).toBe(false);
    expect(await provider.searchAreas("Clap")).toEqual([]);
    expect(await provider.listAll()).toEqual([]);

    fake.state.failWith = undefined;
    expect(await provider.isInServiceArea("SW4")).toBe(true);
    expect(fake.calls.length).toBeGreaterThan(1);
  });
});
