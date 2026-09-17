// The boot slot for the module-level `areas` binding (03 §6.3 "selection `AREAS_SOURCE.provider`"). Until
// `configureAreas` installs a provider, every call **fails closed** — the same choice `platform` makes for its
// ports, and for the same reason: `db-areas` needs the `areas` table (migration `0001`), so a default that
// "worked" could only be a stub succeeding silently where a database was meant to answer.
//
// `searchAreas` / `listAll` / `isInServiceArea` cannot report a failure (03 §6.2 — they never throw and have no
// `Result`), so unconfigured they return the empty answer. That is the one place this seam is quiet, and the
// README says so.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { AreasProvider } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Areas is not configured", {
  reason: "areas-not-configured" as const,
});

const unconfigured: AreasProvider = Object.freeze({
  searchAreas: async () => Object.freeze([]),
  lookupArea: async () => NOT_CONFIGURED,
  isInServiceArea: async () => false,
  centroid: async () => NOT_CONFIGURED,
  distanceKm: async () => NOT_CONFIGURED,
  listAll: async () => Object.freeze([]),
});

export const AREAS_REGISTRY: Registry<AreasProvider> =
  createRegistry<AreasProvider>(unconfigured);
