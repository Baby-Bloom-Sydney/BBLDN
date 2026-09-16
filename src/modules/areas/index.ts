// areas connector (01 §2.4, §2.5; 03 §6.2) — the one geography source for London: area name + postcode district
// + centroid. Service module (ADR-069), importable by any module; imports `config`, `shared-types` and
// `platform` only (ADR-116). Swappable (L2 / L3): `stub-areas` today, `db-areas` once migration `0001` lands.
export type * from "./types";

// The connector (03 §6.2) — the module binding over the boot registry.
export { areas } from "./lib/default-areas";
export { configureAreas } from "./lib/configure-areas";

// The provider (03 §6.3). `db-areas` is not this unit — it needs the `areas` table (HANDOFF §11).
export { stubAreas } from "./areas.stub";

// Pure helpers the contract names beside the provider (03 §6.2; 01 §2.4 append, 03 §12 item 4).
export { formatAreaLabel } from "./lib/format-area-label";
export { normaliseDistrict } from "./lib/normalise-district";
