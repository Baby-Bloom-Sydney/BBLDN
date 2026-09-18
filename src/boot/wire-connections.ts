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
// `2d` injects a third for the same reason (kickoff debt 2): **`nannyNameOf`** — the one `nanny_public` read that
// answers a first name (`matching.publicNannyName`; 07 §5.1 rule 4 keeps contact detail out of that view). 01
// §2.3 gives `connections` no arrow to `matching`, and neither `positions` nor `admin` has one either — so this
// is the single place the read exists and all three `{nanny}` surfaces (04 §7.1) reach it through `connections`.
//
// The slice is registered over the **same store instance** the reads use, for the reason `wire-call-layer.ts`
// gives: two stores would let `advance` write one row and a read see another.
import { auth } from "@/modules/auth";
import { comms } from "@/modules/comms";
import {
  configureConnections,
  configureConnectionsDispatch,
  connectionsSliceRegistration,
  createConnections,
  createConnectionsSlice,
} from "@/modules/connections";
import { publicNannyName } from "@/modules/matching";
import { parentProfileStore } from "@/modules/onboarding-parent";
import { ok } from "@/modules/platform";
import { advance, registerSlice } from "@/modules/positions";
import { positions } from "@/modules/positions";
import type {
  Email,
  NannyId,
  ParentId,
  PositionId,
} from "@/modules/shared-types";
import { dbConnectionStore } from "./db-connection-store";
import { dbNannyFacts } from "./db-nanny-facts";
import type { PortWiring } from "./types";

/**
 * The parent, resolved for comms (03 §8.1). Over the same `user_profiles` read `1e` added for S-P-04, so there
 * is one road to a person's address and it is the one the profile owns — an address copied onto a row at
 * Connect time would go stale the moment she changed it.
 */
async function recipientOf(parentId: ParentId) {
  const read = await parentProfileStore.get(parentId as string as never);
  if (!read.ok) return read;
  if (read.value === null) return ok(null);
  return ok({
    email: read.value.email as Email,
    ...(read.value.firstName === "" ? {} : { name: read.value.firstName }),
  });
}

export function wireConnections(): PortWiring {
  const store = dbConnectionStore(auth.data);
  configureConnectionsDispatch(advance);
  configureConnections(
    createConnections({
      store,
      nannyNameOf: (nannyId: NannyId) => publicNannyName(auth, nannyId),
    }),
  );
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
        recipientOf,
      }),
    ),
  );
  return {
    port: "connections",
    binding:
      "the 25 K rows over connection_requests, the two 03 §7.5 reads, and the one nanny_public name read",
    reason:
      "advance and positionFacts are injected rather than imported: 01 §2.3 gives connections no arrow to positions, and boot is the one place that may hold both",
  };
}
