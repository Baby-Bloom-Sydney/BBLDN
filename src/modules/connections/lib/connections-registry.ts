// The boot slot for the module-level `connections` reads. Fails closed until `configureConnections` installs the
// inside: both reads count live connection rows, which arrive with S5's migration set, and answering "none" from
// nowhere would silently widen a matching candidate set that should have been narrowed.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { ConnectionsReads } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Connections is not configured", {
  reason: "connections-not-configured" as const,
});

const unconfigured: ConnectionsReads = Object.freeze({
  liveNannyIdsForParent: async () => NOT_CONFIGURED,
  liveCountForPosition: async () => NOT_CONFIGURED,
  forParent: async () => NOT_CONFIGURED,
  nannyNameOf: async () => NOT_CONFIGURED,
});

export const CONNECTIONS_REGISTRY: Registry<ConnectionsReads> =
  createRegistry<ConnectionsReads>(unconfigured);
