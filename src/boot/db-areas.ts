// `db-areas` (03 §6.3 `AREAS_SOURCE = db`): the `AreasProvider` over the `areas` table (02 §4.2 row 1; `0001` —
// the 291-row Greater London seed, every role reads active rows). The table is reference data that nothing
// mutates outside a data migration, so it is read **once per process** through `auth`'s port and served from
// memory by the same in-memory engine `stub-areas` runs on — 03 §6.2's "cached for the process lifetime". A
// failed load is not cached: the next call tries again, and until it succeeds the `Result` methods answer
// `INTERNAL { reason: 'areas-not-configured' }` (the connector's closed reason set) while the three
// `Result`-less reads answer the closed value (`[]` / `false`), exactly as the unconfigured seam does.
import type { AppDatabase, DataAccessPort } from "@/modules/auth";
import { stubAreas } from "@/modules/areas";
import type { Area, AreaResult, AreasProvider } from "@/modules/areas";
import { err, ok } from "@/modules/platform";

type AreaRow = AppDatabase["Tables"]["areas"]["Row"];
type Loaded = AreaResult<AreasProvider>;

const toArea = (row: AreaRow): Area =>
  Object.freeze({
    name: row.area,
    district: row.district,
    centroid: Object.freeze({ lat: row.lat, lon: row.lon }),
    ...(row.borough === null ? {} : { borough: row.borough }),
  });

export function dbAreas(port: DataAccessPort): AreasProvider {
  const slot: { loading: Promise<Loaded> | undefined } = { loading: undefined };

  const load = async (): Promise<Loaded> => {
    const rows = await port.run({
      name: "areas.loadTable",
      exec: (q) => q.from("areas").select(),
    });
    if (!rows.ok) {
      slot.loading = undefined;
      return err(
        "INTERNAL",
        "The areas table could not be read",
        { reason: "areas-not-configured" },
        rows.error,
      );
    }
    return ok(stubAreas(rows.value.filter((r) => r.is_active).map(toArea)));
  };
  const provider = (): Promise<Loaded> => (slot.loading ??= load());

  return Object.freeze({
    searchAreas: async (query, limit) => {
      const p = await provider();
      return p.ok ? p.value.searchAreas(query, limit) : Object.freeze([]);
    },
    lookupArea: async (district) => {
      const p = await provider();
      return p.ok ? p.value.lookupArea(district) : p;
    },
    isInServiceArea: async (district) => {
      const p = await provider();
      return p.ok ? p.value.isInServiceArea(district) : false;
    },
    centroid: async (district) => {
      const p = await provider();
      return p.ok ? p.value.centroid(district) : p;
    },
    distanceKm: async (a, b) => {
      const p = await provider();
      return p.ok ? p.value.distanceKm(a, b) : p;
    },
    listAll: async () => {
      const p = await provider();
      return p.ok ? p.value.listAll() : Object.freeze([]);
    },
  });
}
