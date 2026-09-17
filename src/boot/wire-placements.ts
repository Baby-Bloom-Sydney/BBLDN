// `placements` (03 §2.2, §2.4) — the three L rows over `nanny_placements`, and the I-3 read `positions` calls.
//
// `advance` is injected for the reason `wire-connections.ts` gives: 01 §2.3 gives `placements` no arrow to
// `positions`, and L-1b / L-2 each fire rows on the connection and the position.
//
// **`openDfyAccess` is deliberately not wired.** ADR-093 puts done-for-you app access on L-1b, and `1h` owns
// the payments inside; a binding that failed closed would make every L-1b fail with it, which would stop a
// nanny's first day being recorded at all. So it is left out, L-1b still lands, and `placement.started` — the
// event `1h` was told to consume — is emitted either way.
import { auth } from "@/modules/auth";
import {
  configurePlacements,
  createPlacements,
  createPlacementsSlice,
  placementsSliceRegistration,
} from "@/modules/placements";
import { advance, registerSlice } from "@/modules/positions";
import { dbPlacementStore } from "./db-placement-store";
import type { PortWiring } from "./types";

export function wirePlacements(): PortWiring {
  const store = dbPlacementStore(auth.data);
  configurePlacements(createPlacements({ store }));
  registerSlice(
    placementsSliceRegistration(createPlacementsSlice({ store, advance })),
  );
  return {
    port: "placements",
    binding: "the three L rows over nanny_placements, plus the I-3 read",
    reason:
      "openDfyAccess is NOT wired: ADR-093 puts app access on L-1b and 1h owns the payments inside; a fail-closed binding would take a nanny's first day down with it. placement.started is emitted regardless, which is the half 1h consumes",
  };
}
