// scoring/distance connector (01 §2.5 sub-module; 03 §7.2) — the **swappable** distance model. Plain
// great-circle day one, transport-reach later (T-4.2, N-8); only `distanceKm` and the location points move when
// it is replaced (swap test 6). Reached from outside the module through `scoring/index.ts` only.
export { haversineProvider } from "./haversine-provider";
export { stubDistanceProvider } from "./distance.stub";
export type { DistanceFixtures } from "./distance.stub";
