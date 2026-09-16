// Boot hook: installs the reads the module-level `connections` binding delegates to. The K-row slice registers
// separately, through `registerConnectionsSlice` (03 §2.1).
import type { ConnectionsReads } from "../types";
import { CONNECTIONS_REGISTRY } from "./connections-registry";

export function configureConnections(reads: ConnectionsReads): void {
  CONNECTIONS_REGISTRY.set(reads);
}
