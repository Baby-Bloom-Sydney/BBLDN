// The connector object `positions` imports (01 §2.3 row `positions`). Every method re-reads the registry so boot
// wiring reaches every importer.
import type { ConnectionsReads } from "../types";
import { CONNECTIONS_REGISTRY } from "./connections-registry";

export const connections: ConnectionsReads = Object.freeze({
  liveNannyIdsForParent: (parentId) =>
    CONNECTIONS_REGISTRY.get().liveNannyIdsForParent(parentId),
  liveCountForPosition: (positionId) =>
    CONNECTIONS_REGISTRY.get().liveCountForPosition(positionId),
  forParent: (parentId) => CONNECTIONS_REGISTRY.get().forParent(parentId),
  nannyNameOf: (nannyId) => CONNECTIONS_REGISTRY.get().nannyNameOf(nannyId),
});
