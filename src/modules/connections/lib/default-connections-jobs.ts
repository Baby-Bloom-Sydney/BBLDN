// The binding the three cron shells call. Re-reads the registry per call so boot wiring reaches every importer,
// the way `default-connections.ts` does for the reads.
import type { ConnectionsJobs } from "../types";
import { CONNECTIONS_JOBS_REGISTRY } from "./connections-jobs-registry";

export const connectionsJobs: ConnectionsJobs = Object.freeze({
  sweep: (job, now) => CONNECTIONS_JOBS_REGISTRY.get().sweep(job, now),
});
