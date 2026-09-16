// 01 §2.4 `areas` — the connector object every module imports. Each method re-reads the registry so the boot
// wiring (or a later `configureAreas`) reaches every importer that already holds the binding.
import type { AreasProvider } from "../types";
import { AREAS_REGISTRY } from "./areas-registry";

export const areas: AreasProvider = Object.freeze({
  searchAreas: (query, limit) => AREAS_REGISTRY.get().searchAreas(query, limit),
  lookupArea: (district) => AREAS_REGISTRY.get().lookupArea(district),
  isInServiceArea: (district) => AREAS_REGISTRY.get().isInServiceArea(district),
  centroid: (district) => AREAS_REGISTRY.get().centroid(district),
  distanceKm: (a, b) => AREAS_REGISTRY.get().distanceKm(a, b),
  listAll: () => AREAS_REGISTRY.get().listAll(),
});
