// The dispatcher this module's own action uses to fire K-1.
//
// `connections` cannot import `positions.advance` (01 §2.3), and the slice already takes an injected `AdvanceFn`
// for exactly that reason — but a **server action** has no deps object handed to it. So the same function boot
// injects into the slice is also parked here, by the same `configureConnectionsSlice`-shaped seam every other
// registry in this codebase uses: fails closed until boot sets it, and says so.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { AdvanceFn } from "../types";

const NOT_CONFIGURED: ReturnType<AdvanceFn> = Promise.resolve(
  err("INTERNAL", "Connections has no dispatcher", {
    reason: "connections-not-configured" as const,
  }),
);

export const CONNECTIONS_DISPATCH: Registry<AdvanceFn> =
  createRegistry<AdvanceFn>((() => NOT_CONFIGURED) as AdvanceFn);
