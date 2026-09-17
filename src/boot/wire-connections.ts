// `connections` (03 §2.2, §2.4) — the 25 K rows over `connection_requests`, and the two reads `positions` calls.
//
// Two things are injected here that the module cannot import for itself, both because 01 §2.3 gives it no arrow
// to `positions` (the cycle R2 closed):
//
//   **`advance`** — a K row fires P-3 / P-4 / P-5 / L-1 / K-26 through the stage model, and the boot file is the
//   one place that may hold both `positions.advance` and this module.
//   **`positionFacts`** — K-1 / K-2 / K-3's "position live" precondition and the P-row cascades' conditions are
//   facts about a row this module does not own. `positions.getForMatching` is the connector that answers them.
//
// The slice is registered over the **same store instance** the reads use, for the reason `wire-call-layer.ts`
// gives: two stores would let `advance` write one row and a read see another.
import { auth } from "@/modules/auth";
import { comms } from "@/modules/comms";
import {
  configureConnections,
  connectionsSliceRegistration,
  createConnections,
  createConnectionsSlice,
} from "@/modules/connections";
import { ok } from "@/modules/platform";
import { advance, registerSlice } from "@/modules/positions";
import { positions } from "@/modules/positions";
import type { NannyId, PositionId } from "@/modules/shared-types";
import { dbConnectionStore } from "./db-connection-store";
import { dbNannyFacts } from "./db-nanny-facts";
import type { PortWiring } from "./types";

export function wireConnections(): PortWiring {
  const store = dbConnectionStore(auth.data);
  configureConnections(createConnections({ store }));
  registerSlice(
    connectionsSliceRegistration(
      createConnectionsSlice({
        store,
        advance,
        comms,
        positionFacts: async (positionId: PositionId) => {
          const read = await positions.getForMatching(positionId);
          if (!read.ok) return read;
          return ok({ stage: read.value.stage, parentId: read.value.parentId });
        },
        nannyFacts: (nannyId: NannyId) => dbNannyFacts(auth.data, nannyId),
      }),
    ),
  );
  return {
    port: "connections",
    binding:
      "the 25 K rows over connection_requests, plus the two 03 §7.5 reads",
    reason:
      "advance and positionFacts are injected rather than imported: 01 §2.3 gives connections no arrow to positions, and boot is the one place that may hold both",
  };
}
