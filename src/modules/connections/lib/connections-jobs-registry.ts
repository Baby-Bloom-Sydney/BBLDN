// The boot slot for the three scheduled sweeps. Fails closed until `configureConnectionsJobs` installs the
// inside: a sweep that answered "nothing was due" from nowhere would read on the run-summary line exactly like
// a quiet night, and a cron that has silently stopped working is the failure 01 §4f's whole log line exists to
// make visible.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { ConnectionsJobs } from "../types";

const unconfigured: ConnectionsJobs = Object.freeze({
  sweep: async () =>
    err("INTERNAL", "Connections jobs are not configured", {
      reason: "connections-not-configured" as const,
    }),
});

export const CONNECTIONS_JOBS_REGISTRY: Registry<ConnectionsJobs> =
  createRegistry<ConnectionsJobs>(unconfigured);
