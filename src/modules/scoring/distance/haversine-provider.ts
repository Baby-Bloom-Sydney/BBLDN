// `scoring/distance` day one (03 §7.2): the plain great-circle provider. It resolves centroids through `areas`
// and delegates to `areas.distanceKm` — **it never reads a table**, which is what keeps the geometry in one place
// and leaves `scoring/distance` free to become the transport-reach model later (T-4.2) without moving it.
//
// An unknown district is `null` ("distance unknown", scored at `unknownDistancePoints`), not a failure: 03 §7.3
// reserves the failure for a provider that broke. `areas` unconfigured is a broken provider and does fail.
import { areas } from "@/modules/areas";
import { err } from "@/modules/platform";
import type { AreaRef, DistanceProvider } from "../types";

export function haversineProvider(): DistanceProvider {
  return Object.freeze({
    kind: "haversine" as const,
    distanceKm: async (a: AreaRef, b: AreaRef) => {
      const km = await areas.distanceKm(a.district, b.district);
      if (km.ok) return { ok: true as const, value: km.value };
      if (km.error.code === "NOT_FOUND" || km.error.code === "VALIDATION") {
        return { ok: true as const, value: null };
      }
      return err(
        "PROVIDER_ERROR",
        "Distance provider failed",
        { reason: "distance-failed" as const },
        km.error,
      );
    },
  });
}
