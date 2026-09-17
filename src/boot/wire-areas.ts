// `areas` (03 §6.3): the provider is selected by `AREAS_SOURCE` (`config/areas-source.ts` → env), never by an
// import edit (05 §3 rule 1). `db` reads the seeded `areas` table through `auth`'s port; `stub` is the 20-area
// seed of 03 §6.3 — production code, but a stub, and the report says so.
import { auth } from "@/modules/auth";
import { configureAreas, stubAreas } from "@/modules/areas";
import { dbAreas } from "./db-areas";
import type { PortWiring } from "./types";

export function wireAreas(provider: "db" | "stub" | undefined): PortWiring {
  if (provider === "db") {
    configureAreas(dbAreas(auth.data));
    return {
      port: "areas",
      binding: "db-areas (areas table, read once per process)",
    };
  }
  if (provider === "stub") {
    configureAreas(stubAreas());
    return {
      port: "areas",
      binding: "stub-areas",
      reason:
        "AREAS_SOURCE=stub — the 20-area seed of 03 §6.3, not the 291-row table",
    };
  }
  return {
    port: "areas",
    binding: "unconfigured",
    reason:
      "AREAS_SOURCE is unset; the seam stays fail-closed (areas-not-configured)",
  };
}
